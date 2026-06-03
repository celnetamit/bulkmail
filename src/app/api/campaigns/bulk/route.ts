import { randomUUID } from 'node:crypto';

import { requireUserFromCookies } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow, queryRows } from '@/lib/sqlite';
import { getCampaignLists, replaceCampaignLists } from '@/lib/campaign-lists';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function uniqueIds(listIds: unknown) {
  if (!Array.isArray(listIds)) return [];
  return Array.from(new Set(listIds.map((value) => String(value).trim()).filter(Boolean)));
}

function placeholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ');
}

export async function POST(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  const action = typeof body === 'object' && body !== null && 'action' in body ? String((body as Record<string, unknown>).action).trim() : '';
  const campaignIds = uniqueIds(typeof body === 'object' && body !== null ? (body as Record<string, unknown>).campaignIds : []);
  const targetListIds = uniqueIds(typeof body === 'object' && body !== null ? ((body as Record<string, unknown>).targetListIds || (body as Record<string, unknown>).listIds) : []);

  if (!action || !['archive', 'unarchive', 'duplicate', 'retarget'].includes(action)) {
    return fail('Invalid bulk action.', 400);
  }
  if (campaignIds.length === 0) {
    return fail('Select at least one campaign.', 400);
  }

  const ownedCampaigns = queryRows<{
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
  }>(
    `
      SELECT
        id, name, subject, "bodyHtml", status, provider,
        CASE WHEN COALESCE("isArchived", FALSE) THEN 1 ELSE 0 END as "isArchived",
        "totalRecipients", "sentCount", "failedCount", "skippedCount",
        "startedAt", "finishedAt", "durationSeconds", "userId", "listId", "templateId", "createdAt", "updatedAt"
      FROM "Campaign"
      WHERE "userId" = ? AND id IN (${placeholders(campaignIds.length)})
    `,
    [auth.user.userId, ...campaignIds],
  );

  if (ownedCampaigns.length !== campaignIds.length) {
    return fail('One or more campaigns were not found.', 404);
  }

  const ownedById = new Map(ownedCampaigns.map((campaign) => [campaign.id, campaign]));

  if (action === 'archive' && ownedCampaigns.some((campaign) => campaign.status === 'QUEUED' || campaign.status === 'RETRYING' || campaign.status === 'SENDING')) {
    return fail('Queued or sending campaigns cannot be archived.', 409);
  }

  if (action === 'archive' || action === 'unarchive') {
    const archived = action === 'archive' ? 1 : 0;
    executeSql(
      `
        UPDATE "Campaign"
        SET "isArchived" = ?, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "userId" = ? AND id IN (${placeholders(campaignIds.length)})
      `,
      [archived, auth.user.userId, ...campaignIds],
    );

    await recordAuditEvent({
      actorUserId: auth.user.userId,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: action === 'archive' ? 'campaign_bulk_archive' : 'campaign_bulk_unarchive',
      entityType: 'Campaign',
      entityId: campaignIds[0],
      scopeType: 'SELF',
      metadata: { campaignIds, archived: action === 'archive' },
    });

    return ok({ success: true, action, campaignIds });
  }

  if (action === 'retarget' && targetListIds.length === 0) {
    return fail('Select one or more target lists.', 400);
  }

  if (targetListIds.length > 0) {
    const ownedLists = queryRows<{ id: string }>(
      `
        SELECT id
        FROM "List"
        WHERE "userId" = ? AND id IN (${placeholders(targetListIds.length)})
      `,
      [auth.user.userId, ...targetListIds],
    );

    if (ownedLists.length !== targetListIds.length) {
      return fail('One or more target lists were not found.', 404);
    }
  }

  if (action === 'retarget') {
    for (const campaignId of campaignIds) {
      const current = ownedById.get(campaignId);
      if (!current) continue;

      if (current.status === 'QUEUED' || current.status === 'RETRYING' || current.status === 'SENDING') {
        return fail('Queued or sending campaigns cannot be retargeted.', 409);
      }

      executeSql(
        `
          UPDATE "Campaign"
          SET
            status = 'DRAFT',
            provider = NULL,
            "totalRecipients" = 0,
            "sentCount" = 0,
            "failedCount" = 0,
            "skippedCount" = 0,
            "startedAt" = NULL,
            "finishedAt" = NULL,
            "durationSeconds" = NULL,
            "isArchived" = FALSE,
            "listId" = ?,
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = ? AND "userId" = ?
        `,
        [targetListIds[0], campaignId, auth.user.userId],
      );

      try {
        replaceCampaignLists(campaignId, auth.user.userId, targetListIds);
      } catch (error) {
        return fail(error instanceof Error ? error.message : 'Failed to retarget campaign.', 400);
      }
    }

    await recordAuditEvent({
      actorUserId: auth.user.userId,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'campaign_bulk_retarget',
      entityType: 'Campaign',
      entityId: campaignIds[0],
      scopeType: 'SELF',
      metadata: {
        campaignIds,
        targetListIds,
      },
    });

    return ok({ success: true, action, campaignIds, targetListIds });
  }

  const createdCampaignIds: string[] = [];
  for (const campaignId of campaignIds) {
    const source = ownedById.get(campaignId);
    if (!source) continue;

    const campaignLists = getCampaignLists(source.id, auth.user.userId);
    const listIds = campaignLists.length > 0 ? campaignLists.map((list) => list.id) : [source.listId];
    const id = randomUUID().replace(/-/g, '');
    const createdAt = new Date().toISOString();

    executeSql(
      `
        INSERT INTO "Campaign" (
          id, name, subject, "bodyHtml", status, provider,
          "isArchived", "totalRecipients", "sentCount", "failedCount", "skippedCount",
          "startedAt", "finishedAt", "durationSeconds",
          "userId", "listId", "templateId", "createdAt", "updatedAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        `${source.name} Copy`,
        source.subject,
        source.bodyHtml,
        'DRAFT',
        null,
        0,
        0,
        0,
        0,
        0,
        null,
        null,
        null,
        auth.user.userId,
        listIds[0],
        source.templateId,
        createdAt,
        createdAt,
      ],
    );

    try {
      replaceCampaignLists(id, auth.user.userId, listIds);
    } catch (error) {
      executeSql('DELETE FROM "Campaign" WHERE id = ? AND "userId" = ?', [id, auth.user.userId]);
      return fail(error instanceof Error ? error.message : 'Failed to duplicate campaign lists.', 400);
    }

    createdCampaignIds.push(id);
  }

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'campaign_bulk_duplicate',
    entityType: 'Campaign',
    entityId: createdCampaignIds[0] || campaignIds[0],
    scopeType: 'SELF',
    metadata: {
      sourceCampaignIds: campaignIds,
      createdCampaignIds,
      targetListIds: targetListIds.length > 0 ? targetListIds : undefined,
    },
  });

  const duplicatedCampaigns = createdCampaignIds
    .map((id) =>
      queryRow<{
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
            t.name as templateName
          FROM "Campaign" c
          INNER JOIN "List" l ON l.id = c."listId"
          LEFT JOIN "Template" t ON t.id = c."templateId"
          WHERE c.id = ? AND c."userId" = ?
          LIMIT 1
        `,
        [id, auth.user.userId],
      ),
    )
    .filter(Boolean);

  return ok({
    success: true,
    action,
    campaignIds,
    createdCampaignIds,
    campaigns: duplicatedCampaigns,
  });
}
