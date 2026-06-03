import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow } from '@/lib/sqlite';

type Params = { params: { id: string } };
const ALLOWED_STATUSES = new Set(['SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED']);

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  const firstName =
    typeof body === 'object' && body !== null && 'firstName' in body
      ? String((body as Record<string, unknown>).firstName || '').trim()
      : undefined;

  const lastName =
    typeof body === 'object' && body !== null && 'lastName' in body
      ? String((body as Record<string, unknown>).lastName || '').trim()
      : undefined;

  const status =
    typeof body === 'object' && body !== null && 'status' in body
      ? String((body as Record<string, unknown>).status || '').trim().toUpperCase()
      : undefined;

  if (status && !ALLOWED_STATUSES.has(status)) {
    return fail('Invalid status.', 400);
  }

  const contact = queryRow<{ id: string }>(
    `
      SELECT c.id
      FROM "Contact" c
      INNER JOIN "List" l ON l.id = c."listId"
      WHERE c.id = ? AND l."userId" = ?
      LIMIT 1
    `,
    [params.id, auth.user.userId],
  );

  if (!contact) return fail('Contact not found.', 404);

  const assignments: string[] = [];
  const paramsList: unknown[] = [];

  if (firstName !== undefined) {
    assignments.push('"firstName" = ?');
    paramsList.push(firstName || null);
  }
  if (lastName !== undefined) {
    assignments.push('"lastName" = ?');
    paramsList.push(lastName || null);
  }
  if (status) {
    assignments.push('"status" = ?');
    paramsList.push(status);
  }

  if (assignments.length === 0) return fail('No changes provided.', 400);

  executeSql(
    `UPDATE "Contact" SET ${assignments.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
    [...paramsList, params.id],
  );

  const updated = queryRow(
    'SELECT * FROM "Contact" WHERE id = ? LIMIT 1',
    [params.id],
  );

  return ok({ contact: updated });
}

export async function DELETE(_: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const contact = queryRow<{ id: string }>(
    `
      SELECT c.id
      FROM "Contact" c
      INNER JOIN "List" l ON l.id = c."listId"
      WHERE c.id = ? AND l."userId" = ?
      LIMIT 1
    `,
    [params.id, auth.user.userId],
  );

  if (!contact) return fail('Contact not found.', 404);

  executeSql('DELETE FROM "Contact" WHERE id = ?', [params.id]);
  return ok({ success: true });
}
