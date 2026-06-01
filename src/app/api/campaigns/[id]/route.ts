import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow } from '@/lib/sqlite';

type Params = { params: { id: string } };
const ALLOWED_STATUSES = new Set(['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED']);

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try { body = await request.json(); } catch { return fail('Invalid JSON body.', 400); }

  const name = typeof body === 'object' && body && 'name' in body ? String((body as Record<string, unknown>).name).trim() : '';
  const subject = typeof body === 'object' && body && 'subject' in body ? String((body as Record<string, unknown>).subject).trim() : '';
  const bodyHtml = typeof body === 'object' && body && 'bodyHtml' in body ? String((body as Record<string, unknown>).bodyHtml).trim() : '';
  const status = typeof body === 'object' && body && 'status' in body ? String((body as Record<string, unknown>).status).trim().toUpperCase() : '';
  const listId = typeof body === 'object' && body && 'listId' in body ? String((body as Record<string, unknown>).listId || '').trim() : '';
  const templateIdRaw = typeof body === 'object' && body && 'templateId' in body ? String((body as Record<string, unknown>).templateId || '').trim() : '';
  const templateId = templateIdRaw || null;

  if (!name || !subject || !bodyHtml || !status) return fail('name, subject, bodyHtml and status are required.', 400);
  if (!ALLOWED_STATUSES.has(status)) return fail('Invalid status.', 400);

  const existing = queryRow<{ id: string }>(
    'SELECT id FROM "Campaign" WHERE id = ? AND userId = ? LIMIT 1',
    [params.id, auth.user.userId],
  );
  if (!existing) return fail('Campaign not found.', 404);

  if (listId) {
    const list = queryRow<{ id: string }>('SELECT id FROM "List" WHERE id = ? AND userId = ? LIMIT 1', [listId, auth.user.userId]);
    if (!list) return fail('List not found.', 404);
  }

  if (templateId) {
    const template = queryRow<{ id: string }>('SELECT id FROM "Template" WHERE id = ? AND userId = ? LIMIT 1', [templateId, auth.user.userId]);
    if (!template) return fail('Template not found.', 404);
  }

  const assignments = ['"name" = ?', '"subject" = ?', '"bodyHtml" = ?', '"status" = ?'];
  const paramsList: unknown[] = [name, subject, bodyHtml, status];

  if (listId) {
    assignments.push('"listId" = ?');
    paramsList.push(listId);
  }

  assignments.push('"templateId" = ?');
  paramsList.push(templateId);

  executeSql(
    `UPDATE "Campaign" SET ${assignments.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?`,
    [...paramsList, params.id, auth.user.userId],
  );

  const campaign = queryRow(
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
    [params.id, auth.user.userId],
  );

  return ok({ campaign });
}

export async function DELETE(_: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const existing = queryRow<{ id: string }>(
    'SELECT id FROM "Campaign" WHERE id = ? AND userId = ? LIMIT 1',
    [params.id, auth.user.userId],
  );
  if (!existing) return fail('Campaign not found.', 404);

  executeSql('DELETE FROM "Campaign" WHERE id = ? AND userId = ?', [params.id, auth.user.userId]);
  return ok({ success: true });
}
