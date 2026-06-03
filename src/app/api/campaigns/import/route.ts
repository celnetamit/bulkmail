import { randomUUID } from 'node:crypto';

import { requireUserFromCookies } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow, queryRows } from '@/lib/sqlite';
import { getCampaignLists, replaceCampaignLists } from '@/lib/campaign-lists';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ImportedCampaign = {
  name: string;
  subject: string;
  bodyHtml: string;
  listIds?: string[];
  listId?: string;
  templateId?: string | null;
  isArchived?: boolean;
};

function uniqueIds(values: unknown) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));
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

  const campaigns = typeof body === 'object' && body !== null && Array.isArray((body as Record<string, unknown>).campaigns)
    ? ((body as Record<string, unknown>).campaigns as ImportedCampaign[])
    : [];

  if (campaigns.length === 0) {
    return fail('No campaigns provided for import.', 400);
  }

  const createdCampaignIds: string[] = [];

  for (const input of campaigns) {
    const name = String(input?.name || '').trim();
    const subject = String(input?.subject || '').trim();
    const bodyHtml = String(input?.bodyHtml || '').trim();
    const listIds = uniqueIds([...(input?.listIds || []), ...(input?.listId ? [input.listId] : [])]);
    const templateId = String(input?.templateId || '').trim() || null;

    if (!name || !subject || !bodyHtml || listIds.length === 0) {
      return fail('Each imported campaign needs a name, subject, body, and at least one list.', 400);
    }

    const ownedLists = queryRows<{ id: string }>(
      `
        SELECT id
        FROM "List"
        WHERE "userId" = ? AND id IN (${placeholders(listIds.length)})
      `,
      [auth.user.userId, ...listIds],
    );
    if (ownedLists.length !== listIds.length) {
      return fail('One or more campaign lists were not found.', 404);
    }

    if (templateId) {
      const template = queryRow<{ id: string }>(
        'SELECT id FROM "Template" WHERE id = ? AND "userId" = ? LIMIT 1',
        [templateId, auth.user.userId],
      );
      if (!template) {
        return fail('Template not found for imported campaign.', 404);
      }
    }

    const id = randomUUID().replace(/-/g, '');
    const createdAt = new Date().toISOString();
    executeSql(
      `
        INSERT INTO "Campaign" (
          id, name, subject, "bodyHtml", status, provider,
          "isArchived", "totalRecipients", "sentCount", "failedCount", "skippedCount",
          "startedAt", "finishedAt", "durationSeconds",
          "userId", "listId", "templateId", "createdAt", "updatedAt"
        ) VALUES (?, ?, ?, ?, 'DRAFT', NULL, ?, 0, 0, 0, 0, NULL, NULL, NULL, ?, ?, ?, ?, ?)
      `,
      [
        id,
        name,
        subject,
        bodyHtml,
        input?.isArchived ? 1 : 0,
        auth.user.userId,
        listIds[0],
        templateId,
        createdAt,
        createdAt,
      ],
    );

    try {
      replaceCampaignLists(id, auth.user.userId, listIds);
    } catch (error) {
      executeSql('DELETE FROM "Campaign" WHERE id = ? AND "userId" = ?', [id, auth.user.userId]);
      return fail(error instanceof Error ? error.message : 'Failed to import campaign lists.', 400);
    }

    createdCampaignIds.push(id);
  }

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'campaign_import',
    entityType: 'Campaign',
    entityId: createdCampaignIds[0],
    scopeType: 'SELF',
    metadata: {
      importedCount: createdCampaignIds.length,
      importedCampaignIds: createdCampaignIds,
    },
  });

  const firstCampaign = createdCampaignIds[0]
    ? queryRow(
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
        [createdCampaignIds[0], auth.user.userId],
      )
    : null;

  const firstLists = createdCampaignIds[0] ? getCampaignLists(createdCampaignIds[0], auth.user.userId) : [];

  return ok({
    success: true,
    importedCount: createdCampaignIds.length,
    importedCampaignIds: createdCampaignIds,
    campaign: firstCampaign
      ? {
          ...firstCampaign,
          list: { id: firstCampaign.listId, name: firstCampaign.listName },
          lists: firstLists,
          template: firstCampaign.templateId ? { id: firstCampaign.templateId, name: firstCampaign.templateName || '' } : null,
        }
      : null,
  }, 201);
}
