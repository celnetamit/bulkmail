import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow } from '@/lib/sqlite';

type Params = { params: { id: string } };

export async function GET(_: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const list = queryRow<{
    id: string;
    name: string;
    description: string | null;
    userId: string;
    createdAt: string;
    updatedAt: string;
    contactsCount: number;
    campaignsCount: number;
  }>(
    `
      SELECT
        l.id,
        l.name,
        l.description,
        l.userId,
        l.createdAt,
        l.updatedAt,
        (SELECT COUNT(*) FROM "Contact" c WHERE c.listId = l.id) as contactsCount,
        (SELECT COUNT(*) FROM "Campaign" ca WHERE ca.listId = l.id) as campaignsCount
      FROM "List" l
      WHERE l.id = ? AND l.userId = ?
      LIMIT 1
    `,
    [params.id, auth.user.userId],
  );

  if (!list) return fail('List not found.', 404);
  return ok({ list });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  const name =
    typeof body === 'object' && body !== null && 'name' in body
      ? String((body as Record<string, unknown>).name).trim()
      : '';

  const description =
    typeof body === 'object' && body !== null && 'description' in body
      ? String((body as Record<string, unknown>).description || '').trim()
      : '';

  if (!name) return fail('List name is required.', 400);

  const existing = queryRow<{ id: string }>(
    'SELECT id FROM "List" WHERE id = ? AND userId = ? LIMIT 1',
    [params.id, auth.user.userId],
  );

  if (!existing) return fail('List not found.', 404);

  executeSql(
    'UPDATE "List" SET name = ?, description = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?',
    [name, description || null, params.id, auth.user.userId],
  );

  const list = queryRow(
    'SELECT * FROM "List" WHERE id = ? AND userId = ? LIMIT 1',
    [params.id, auth.user.userId],
  );

  return ok({ list });
}

export async function DELETE(_: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const existing = queryRow<{ id: string }>(
    'SELECT id FROM "List" WHERE id = ? AND userId = ? LIMIT 1',
    [params.id, auth.user.userId],
  );

  if (!existing) return fail('List not found.', 404);

  executeSql('DELETE FROM "List" WHERE id = ? AND userId = ?', [params.id, auth.user.userId]);
  return ok({ success: true });
}
