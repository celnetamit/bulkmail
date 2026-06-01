import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow } from '@/lib/sqlite';

type Params = { params: { id: string } };

export async function POST(_: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

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
  }>(
    'SELECT * FROM "Campaign" WHERE id = ? AND userId = ? LIMIT 1',
    [params.id, auth.user.userId],
  );

  if (!campaign) return fail('Campaign not found.', 404);

  const id = crypto.randomUUID().replace(/-/g, '');
  const createdAt = new Date().toISOString();

  executeSql(
    `
      INSERT INTO "Campaign" (
        id, name, subject, bodyHtml, status, provider,
        totalRecipients, sentCount, failedCount, skippedCount,
        startedAt, finishedAt, durationSeconds,
        userId, listId, templateId, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      `${campaign.name} Copy`,
      campaign.subject,
      campaign.bodyHtml,
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
      campaign.listId,
      campaign.templateId,
      createdAt,
      createdAt,
    ],
  );

  const duplicated = queryRow(
    `
      SELECT
        c.id,
        c.name,
        c.subject,
        c.bodyHtml,
        c.status,
        c.provider,
        c.totalRecipients,
        c.sentCount,
        c.failedCount,
        c.skippedCount,
        c.startedAt,
        c.finishedAt,
        c.durationSeconds,
        c.userId,
        c.listId,
        c.templateId,
        c.createdAt,
        c.updatedAt,
        l.name as listName,
        t.name as templateName
      FROM "Campaign" c
      INNER JOIN "List" l ON l.id = c.listId
      LEFT JOIN "Template" t ON t.id = c.templateId
      WHERE c.id = ? AND c.userId = ?
      LIMIT 1
    `,
    [id, auth.user.userId],
  );

  return ok({ campaign: duplicated }, 201);
}
