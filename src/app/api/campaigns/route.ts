import { performance } from 'node:perf_hooks';
import { NextResponse } from 'next/server';
import { requireUserFromCookies } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { queryRow, queryRows, executeSql } from '@/lib/sqlite';
import { getCampaignLists, replaceCampaignLists } from '@/lib/campaign-lists';
import { buildOwnerScope, isOwnedByViewer } from '@/lib/data-scope';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function buildInClause(values: string[]) {
  return values.map(() => '?').join(', ');
}

function jsonWithCampaignTimingHeaders(
  payload: { campaigns: unknown[]; scope: string },
  input: {
    durationMs: number;
    summaryOnly: boolean;
    includeArchived: boolean;
    campaignCount: number;
    compact: boolean;
  },
) {
  return NextResponse.json(payload, {
    status: 200,
    headers: {
      'x-campaigns-api-duration-ms': input.durationMs.toFixed(2),
      'x-campaigns-api-summary': input.summaryOnly ? '1' : '0',
      'x-campaigns-api-include-archived': input.includeArchived ? '1' : '0',
      'x-campaigns-api-campaign-count': String(input.campaignCount),
      'x-campaigns-api-compact': input.compact ? '1' : '0',
    },
  });
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;
  const url = new URL(request.url);
  const includeArchived = url.searchParams.get('includeArchived') === 'true' || url.searchParams.get('includeArchived') === '1';
  const summaryOnly = url.searchParams.get('summary') === 'true' || url.searchParams.get('summary') === '1';
  const compact = url.searchParams.get('compact') === 'true' || url.searchParams.get('compact') === '1';
  const ownerScope = buildOwnerScope(auth.user, 'c."userId"');

  const campaigns = queryRows<{
    id: string;
    name: string;
    subject?: string | null;
    bodyHtml?: string | null;
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
    ownerEmail: string;
    ownerName: string | null;
    ownerRole: string;
  }>(
    `
      SELECT
        c.id,
        c.name,
        ${summaryOnly ? 'NULL as subject,' : 'c.subject,'}
        ${summaryOnly ? 'NULL as "bodyHtml",' : 'c."bodyHtml",'}
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
        u.email as ownerEmail,
        u.name as ownerName,
        u.role as ownerRole
      FROM "Campaign" c
      INNER JOIN "List" l ON l.id = c."listId"
      INNER JOIN "User" u ON u.id = c."userId"
      WHERE ${ownerScope.clause}
      ${includeArchived ? '' : 'AND COALESCE(c.isArchived, FALSE) = FALSE'}
      ORDER BY c."createdAt" DESC
    `,
    ownerScope.params,
  );

  if (campaigns.length === 0) {
    return jsonWithCampaignTimingHeaders(
      { campaigns: [], scope: ownerScope.scope },
      {
        durationMs: performance.now() - startedAt,
        summaryOnly,
        includeArchived,
        campaignCount: 0,
        compact,
      },
    );
  }

  if (compact) {
    const compactCampaigns = campaigns.map((campaign: any) => ({
      ...campaign,
      list: { id: campaign.listId, name: campaign.listName },
      lists: [{ id: campaign.listId, name: campaign.listName, isDefaultTestList: false }],
      listCount: 1,
      template: null,
      owner: {
        id: campaign.userId,
        email: campaign.ownerEmail,
        name: campaign.ownerName,
        role: campaign.ownerRole,
      },
      isOwner: isOwnedByViewer(campaign.userId, auth.user),
      openedCount: 0,
      deliveredCount: 0,
      bouncedCount: 0,
      unsubscribedCount: 0,
    }));

    return jsonWithCampaignTimingHeaders(
      { campaigns: compactCampaigns, scope: ownerScope.scope },
      {
        durationMs: performance.now() - startedAt,
        summaryOnly,
        includeArchived,
        campaignCount: compactCampaigns.length,
        compact: true,
      },
    );
  }

  const campaignIds = campaigns.map((campaign) => campaign.id);
  const eventParams = [...campaignIds];
  const eventInClause = buildInClause(campaignIds);
  const rows = queryRows<{
    campaignId: string;
    openedCount: number;
    deliveredCount: number;
    bouncedCount: number;
    unsubscribedCount: number;
  }>(
    `
      SELECT
        e."campaignId" as "campaignId",
        SUM(CASE WHEN e.type = 'OPENED' THEN 1 ELSE 0 END) as "openedCount",
        SUM(CASE WHEN e.type = 'DELIVERED' THEN 1 ELSE 0 END) as "deliveredCount",
        SUM(CASE WHEN e.type = 'BOUNCED' THEN 1 ELSE 0 END) as "bouncedCount",
        SUM(CASE WHEN e.type = 'UNSUBSCRIBED' THEN 1 ELSE 0 END) as "unsubscribedCount"
      FROM "Event" e
      WHERE e."campaignId" IN (${eventInClause})
      GROUP BY e."campaignId"
    `,
    eventParams,
  );

  const listParams = [...campaignIds];
  const listInClause = buildInClause(campaignIds);
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
      INNER JOIN "List" l ON l.id = cl."listId"
      WHERE cl."campaignId" IN (${listInClause})
      ORDER BY cl."createdAt" ASC
    `,
    listParams,
  );

  const byCampaign = new Map<string, {
    openedCount: number;
    deliveredCount: number;
    bouncedCount: number;
    unsubscribedCount: number;
  }>();
  const listsByCampaign = new Map<string, { id: string; name: string; isDefaultTestList: number | boolean }[]>();

  for (const row of rows) {
    byCampaign.set(row.campaignId, {
      openedCount: Number(row.openedCount || 0),
      deliveredCount: Number(row.deliveredCount || 0),
      bouncedCount: Number(row.bouncedCount || 0),
      unsubscribedCount: Number(row.unsubscribedCount || 0),
    });
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
      const counts = byCampaign.get(campaign.id);
      const selectedLists = listsByCampaign.get(campaign.id) || [];
      return {
        ...campaign,
        list: { id: campaign.listId, name: campaign.listName },
        lists: selectedLists.length > 0 ? selectedLists : [{ id: campaign.listId, name: campaign.listName, isDefaultTestList: false }],
        listCount: selectedLists.length > 0 ? selectedLists.length : 1,
        template: campaign.templateId ? { id: campaign.templateId, name: '' } : null,
        owner: {
          id: campaign.userId,
          email: campaign.ownerEmail,
          name: campaign.ownerName,
          role: campaign.ownerRole,
        },
        isOwner: isOwnedByViewer(campaign.userId, auth.user),
        openedCount: counts?.openedCount || 0,
        deliveredCount: counts?.deliveredCount || 0,
        bouncedCount: counts?.bouncedCount || 0,
        unsubscribedCount: counts?.unsubscribedCount || 0,
      };
    });

  return jsonWithCampaignTimingHeaders(
    { campaigns: campaignsWithStats, scope: ownerScope.scope },
    {
      durationMs: performance.now() - startedAt,
      summaryOnly,
      includeArchived,
      campaignCount: campaignsWithStats.length,
      compact: false,
    },
  );
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
