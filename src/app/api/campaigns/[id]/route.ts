import { requireUserFromCookies } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow, queryRows } from '@/lib/sqlite';
import { getCampaignLists, replaceCampaignLists } from '@/lib/campaign-lists';
import { buildOwnerScope, isOwnedByViewer } from '@/lib/data-scope';
import { isCampaignLockedForEditing } from '@/lib/campaign-send-queue';

type Params = { params: { id: string } };
const ALLOWED_STATUSES = new Set(['DRAFT', 'SCHEDULED', 'QUEUED', 'RETRYING', 'SENDING', 'PAUSED', 'CANCELLED', 'SENT', 'FAILED', 'SKIPPED']);

export async function GET(_: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;
  const ownerScope = buildOwnerScope(auth.user, 'c."userId"');

  const campaign = queryRow<{
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
      WHERE c.id = ? AND ${ownerScope.clause}
      LIMIT 1
    `,
    [params.id, ...ownerScope.params],
  );

  if (!campaign) return fail('Campaign not found.', 404);
  const selectedLists = queryRows<{ id: string; name: string; isDefaultTestList: number | boolean }>(
    `
      SELECT
        l.id,
        l.name,
        CASE WHEN COALESCE(l."isDefaultTestList", FALSE) THEN 1 ELSE 0 END as "isDefaultTestList"
      FROM "CampaignList" cl
      INNER JOIN "List" l ON l.id = cl."listId"
      WHERE cl."campaignId" = ?
      ORDER BY cl."createdAt" ASC
    `,
    [params.id],
  );

  const lastJob = queryRow<{ skipReason: string | null; lastError: string | null; status: string | null; finishedAt: string | null }>(
    `
      SELECT skipReason, lastError, status, "finishedAt"
      FROM "CampaignSendJob"
      WHERE "campaignId" = ?
      ORDER BY "createdAt" DESC
      LIMIT 1
    `,
    [params.id],
  );

  return ok({
    campaign: {
      ...campaign,
      list: selectedLists[0] ? { id: selectedLists[0].id, name: selectedLists[0].name } : { id: campaign.listId, name: campaign.listName },
      lists: selectedLists.length > 0 ? selectedLists : [{ id: campaign.listId, name: campaign.listName, isDefaultTestList: false }],
      template: campaign.templateId ? { id: campaign.templateId, name: campaign.templateName || '' } : null,
      owner: {
        id: campaign.userId,
        email: campaign.ownerEmail,
        name: campaign.ownerName,
        role: campaign.ownerRole,
      },
      isOwner: isOwnedByViewer(campaign.userId, auth.user),
      lastJob: lastJob || null,
    },
    scope: ownerScope.scope,
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try { body = await request.json(); } catch { return fail('Invalid JSON body.', 400); }

  const name = typeof body === 'object' && body && 'name' in body ? String((body as Record<string, unknown>).name).trim() : '';
  const subject = typeof body === 'object' && body && 'subject' in body ? String((body as Record<string, unknown>).subject).trim() : '';
  const bodyHtml = typeof body === 'object' && body && 'bodyHtml' in body ? String((body as Record<string, unknown>).bodyHtml).trim() : '';
  const status = typeof body === 'object' && body && 'status' in body ? String((body as Record<string, unknown>).status).trim().toUpperCase() : '';
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

  if (!name || !subject || !bodyHtml || !status) return fail('name, subject, bodyHtml and status are required.', 400);
  if (!ALLOWED_STATUSES.has(status)) return fail('Invalid status.', 400);
  if (listIds.length === 0) return fail('At least one list is required.', 400);

  const existing = queryRow<{ id: string; listId: string; status: string; isArchived: number | boolean }>(
    'SELECT id, "listId", status, CASE WHEN COALESCE("isArchived", FALSE) THEN 1 ELSE 0 END as "isArchived" FROM "Campaign" WHERE id = ? AND "userId" = ? LIMIT 1',
    [params.id, auth.user.userId],
  );
  if (!existing) return fail('Campaign not found.', 404);
  if (existing.isArchived) {
    return fail('Archived campaigns cannot be edited.', 409);
  }
  if (isCampaignLockedForEditing(existing.status)) {
    return fail('Queued or sending campaigns cannot be edited.', 409);
  }
  const previousListId = existing.listId;

  const ownedLists = queryRow<{ total: number }>(
    `
      SELECT COUNT(*) as total
      FROM "List"
      WHERE "userId" = ? AND id IN (${listIds.map(() => '?').join(', ')})
    `,
    [auth.user.userId, ...listIds],
  );
  if ((ownedLists?.total || 0) !== listIds.length) return fail('One or more lists were not found.', 404);

  if (templateId) {
    const template = queryRow<{ id: string }>('SELECT id FROM "Template" WHERE id = ? AND "userId" = ? LIMIT 1', [templateId, auth.user.userId]);
    if (!template) return fail('Template not found.', 404);
  }

  const assignments = ['"name" = ?', '"subject" = ?', '"bodyHtml" = ?', '"status" = ?'];
  const paramsList: unknown[] = [name, subject, bodyHtml, status];

  assignments.push('"listId" = ?');
  paramsList.push(listIds[0]);

  assignments.push('"templateId" = ?');
  paramsList.push(templateId);

  executeSql(
    `UPDATE "Campaign" SET ${assignments.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ? AND "userId" = ?`,
    [...paramsList, params.id, auth.user.userId],
  );

  try {
    replaceCampaignLists(params.id, auth.user.userId, listIds);
  } catch (error) {
    executeSql(
      'UPDATE "Campaign" SET "listId" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ? AND "userId" = ?',
      [previousListId, params.id, auth.user.userId],
    );
    return fail(error instanceof Error ? error.message : 'Failed to update campaign lists.', 400);
  }

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'campaign_update',
    entityType: 'Campaign',
    entityId: params.id,
    scopeType: 'SELF',
    metadata: {
      changedFields: ['name', 'subject', 'bodyHtml', 'status', 'listIds', 'templateId'],
      status,
      listIds,
      templateId,
    },
  });

  const campaign = queryRow(
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
        t.name as templateName
      FROM "Campaign" c
      INNER JOIN "List" l ON l.id = c."listId"
      LEFT JOIN "Template" t ON t.id = c."templateId"
      WHERE c.id = ? AND c."userId" = ?
      LIMIT 1
    `,
    [params.id, auth.user.userId],
  );

  const updatedLists = getCampaignLists(params.id, auth.user.userId);
  return ok({
    campaign: {
      ...campaign,
      list: updatedLists[0] ? { id: updatedLists[0].id, name: updatedLists[0].name } : { id: listIds[0], name: '' },
      lists: updatedLists,
      template: campaign?.templateId ? { id: campaign.templateId, name: campaign.templateName || '' } : null,
    },
  });
}

export async function DELETE(_: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const existing = queryRow<{ id: string; status: string }>(
    'SELECT id, status FROM "Campaign" WHERE id = ? AND "userId" = ? LIMIT 1',
    [params.id, auth.user.userId],
  );
  if (!existing) return fail('Campaign not found.', 404);
  if (isCampaignLockedForEditing(existing.status)) {
    return fail('Queued or sending campaigns cannot be deleted.', 409);
  }

  executeSql('DELETE FROM "Campaign" WHERE id = ? AND "userId" = ?', [params.id, auth.user.userId]);
  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'campaign_delete',
    entityType: 'Campaign',
    entityId: params.id,
    scopeType: 'SELF',
  });
  return ok({ success: true });
}
