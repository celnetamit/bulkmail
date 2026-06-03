import { requireUserFromCookies } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { queryRow, queryRows, executeSql } from '@/lib/sqlite';
import { getCampaignLists, replaceCampaignLists } from '@/lib/campaign-lists';
import { buildOwnerScope, isOwnedByViewer } from '@/lib/data-scope';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;
  const url = new URL(request.url);
  const includeArchived = url.searchParams.get('includeArchived') === 'true' || url.searchParams.get('includeArchived') === '1';
  const ownerScope = buildOwnerScope(auth.user, 'c."userId"');

  const campaigns = queryRows<{
    id: string;
    name: string;
    subject: string;
    bodyHtml: string;
    status: string;
    provider: string | null;
    isArchived: number | boolean;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    startedAt: string | null;
    finishedAt: string | null;
    durationSeconds: number | null;
    userId: string;
    listId: string;
    templateId: string | null;
    createdAt: string;
    updatedAt: string;
    listName: string;
    templateName: string | null;
    ownerEmail: string;
    ownerName: string | null;
    ownerRole: string;
  }>(
    `
      SELECT
        c.id,
        c.name,
        c.subject,
        c."bodyHtml",
        c.status,
        c.provider,
        CASE WHEN COALESCE(c."isArchived", FALSE) THEN 1 ELSE 0 END as "isArchived",
        c."totalRecipients",
        c."sentCount",
        c."failedCount",
        c."skippedCount",
        c."startedAt",
        c."finishedAt",
        c."durationSeconds",
        c."userId",
        c."listId",
        c."templateId",
        c."createdAt",
        c."updatedAt",
        l.name as listName,
        t.name as templateName,
        u.email as ownerEmail,
        u.name as ownerName,
        u.role as ownerRole
      FROM "Campaign" c
      INNER JOIN "List" l ON l.id = c."listId"
      LEFT JOIN "Template" t ON t.id = c."templateId"
      INNER JOIN "User" u ON u.id = c."userId"
      WHERE ${ownerScope.clause}
      ${includeArchived ? '' : 'AND COALESCE(c.isArchived, FALSE) = FALSE'}
      ORDER BY c."createdAt" DESC
    `,
    ownerScope.params,
  );

  const rows = queryRows<{
    campaignId: string;
    type: string;
    count: number;
  }>(
    `
      SELECT e."campaignId" as "campaignId", e.type as type, COUNT(*) as count
      FROM "Event" e
      INNER JOIN "Campaign" c ON c.id = e."campaignId"
      WHERE ${ownerScope.clause}
      GROUP BY e."campaignId", e.type
    `,
    ownerScope.params,
  );

  const campaignListRows = queryRows<{
    campaignId: string;
    listId: string;
    listName: string;
    isDefaultTestList: number | boolean;
  }>(
    `
      SELECT
        cl."campaignId" as "campaignId",
        cl."listId" as "listId",
        l.name as listName,
        CASE WHEN COALESCE(l."isDefaultTestList", FALSE) THEN 1 ELSE 0 END as "isDefaultTestList"
      FROM "CampaignList" cl
      INNER JOIN "Campaign" c ON c.id = cl."campaignId"
      INNER JOIN "List" l ON l.id = cl."listId"
      WHERE ${ownerScope.clause}
      ORDER BY cl."createdAt" ASC
    `,
    ownerScope.params,
  );

  const byCampaign = new Map<string, Record<string, number>>();
  const listsByCampaign = new Map<string, { id: string; name: string; isDefaultTestList: number | boolean }[]>();

  for (const row of rows) {
    if (!byCampaign.has(row.campaignId)) byCampaign.set(row.campaignId, {});
    byCampaign.get(row.campaignId)![row.type] = row.count;
  }

  for (const row of campaignListRows) {
    if (!listsByCampaign.has(row.campaignId)) listsByCampaign.set(row.campaignId, []);
    listsByCampaign.get(row.campaignId)!.push({
      id: row.listId,
      name: row.listName,
      isDefaultTestList: row.isDefaultTestList,
    });
  }

  const campaignsWithStats = campaigns.map((campaign: any) => {
      const counts = byCampaign.get(campaign.id) || {};
      const selectedLists = listsByCampaign.get(campaign.id) || [];
      return {
        ...campaign,
        list: { id: campaign.listId, name: campaign.listName },
        lists: selectedLists.length > 0 ? selectedLists : [{ id: campaign.listId, name: campaign.listName, isDefaultTestList: false }],
        listCount: selectedLists.length > 0 ? selectedLists.length : 1,
        template: campaign.templateId ? { id: campaign.templateId, name: campaign.templateName || '' } : null,
        owner: {
          id: campaign.userId,
          email: campaign.ownerEmail,
          name: campaign.ownerName,
          role: campaign.ownerRole,
        },
        isOwner: isOwnedByViewer(campaign.userId, auth.user),
        openedCount: counts.OPENED || 0,
        deliveredCount: counts.DELIVERED || 0,
        bouncedCount: counts.BOUNCED || 0,
        unsubscribedCount: counts.UNSUBSCRIBED || 0,
      };
    });

  return ok({ campaigns: campaignsWithStats, scope: ownerScope.scope });
}

export async function POST(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try { body = await request.json(); } catch { return fail('Invalid JSON body.', 400); }

  const name = typeof body === 'object' && body && 'name' in body ? String((body as Record<string, unknown>).name).trim() : '';
  const subject = typeof body === 'object' && body && 'subject' in body ? String((body as Record<string, unknown>).subject).trim() : '';
  const bodyHtml = typeof body === 'object' && body && 'bodyHtml' in body ? String((body as Record<string, unknown>).bodyHtml).trim() : '';
  const templateIdRaw = typeof body === 'object' && body && 'templateId' in body ? String((body as Record<string, unknown>).templateId || '').trim() : '';
  const templateId = templateIdRaw || null;
  const listIdsRaw = typeof body === 'object' && body && 'listIds' in body && Array.isArray((body as Record<string, unknown>).listIds)
    ? ((body as Record<string, unknown>).listIds as unknown[])
    : [];
  const listIdFallback = typeof body === 'object' && body && 'listId' in body ? String((body as Record<string, unknown>).listId || '').trim() : '';
  const listIds = Array.from(new Set([
    ...listIdsRaw.map((value: unknown) => String(value).trim()).filter(Boolean),
    ...(listIdFallback ? [listIdFallback] : []),
  ]));

  if (!name || listIds.length === 0 || !subject || !bodyHtml) return fail('name, listIds, subject and bodyHtml are required.', 400);

  const primaryListId = listIds[0];
  const ownedLists = queryRows<{ id: string }>(
    `
      SELECT id
      FROM "List"
      WHERE "userId" = ? AND id IN (${listIds.map(() => '?').join(', ')})
    `,
    [auth.user.userId, ...listIds],
  );
  if (ownedLists.length !== listIds.length) return fail('One or more lists were not found.', 404);

  if (templateId) {
    const template = queryRow<{ id: string }>(
      'SELECT id FROM "Template" WHERE id = ? AND "userId" = ? LIMIT 1',
      [templateId, auth.user.userId],
    );
    if (!template) return fail('Template not found.', 404);
  }

  const id = crypto.randomUUID().replace(/-/g, '');
  const createdAt = new Date().toISOString();
  const updatedAt = createdAt;

  executeSql(
    `
      INSERT INTO "Campaign" (
        id, name, subject, "bodyHtml", status, provider,
        "totalRecipients", "sentCount", "failedCount", "skippedCount",
        "startedAt", "finishedAt", "durationSeconds",
        "userId", "listId", "templateId", "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      name,
      subject,
      bodyHtml,
      'DRAFT',
      null,
      0,
      0,
      0,
      0,
      null,
      null,
      null,
      auth.user.userId,
      primaryListId,
      templateId,
      createdAt,
      updatedAt,
    ],
  );

  try {
  replaceCampaignLists(id, auth.user.userId, listIds);
  } catch (error) {
    executeSql('DELETE FROM "Campaign" WHERE id = ? AND "userId" = ?', [id, auth.user.userId]);
    return fail(error instanceof Error ? error.message : 'Failed to create campaign lists.', 400);
  }

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'campaign_create',
    entityType: 'Campaign',
    entityId: id,
    scopeType: 'SELF',
    metadata: {
      name,
      subject,
      listIds,
      templateId,
      status: 'DRAFT',
    },
  });

  const campaign = queryRow<{
    id: string;
    name: string;
    subject: string;
    bodyHtml: string;
    status: string;
    provider: string | null;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    startedAt: string | null;
    finishedAt: string | null;
    durationSeconds: number | null;
    userId: string;
    listId: string;
    templateId: string | null;
    createdAt: string;
    updatedAt: string;
  }>('SELECT * FROM "Campaign" WHERE id = ? LIMIT 1', [id]);

  const selectedLists = getCampaignLists(id, auth.user.userId);

  return ok({
    campaign: campaign
      ? {
          ...campaign,
          list: selectedLists[0] ? { id: selectedLists[0].id, name: selectedLists[0].name } : { id: primaryListId, name: '' },
          lists: selectedLists,
        }
      : null,
  }, 201);
}
