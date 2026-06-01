import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow, queryRows } from '@/lib/sqlite';

export async function GET() {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const lists = queryRows<{
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
      WHERE l.userId = ?
      ORDER BY l.createdAt DESC
    `,
    [auth.user.userId],
  );

  return ok({ lists });
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

  const name =
    typeof body === 'object' && body !== null && 'name' in body
      ? String((body as Record<string, unknown>).name).trim()
      : '';

  const description =
    typeof body === 'object' && body !== null && 'description' in body
      ? String((body as Record<string, unknown>).description || '').trim()
      : '';

  if (!name) {
    return fail('List name is required.', 400);
  }

  const id = crypto.randomUUID().replace(/-/g, '');
  const createdAt = new Date().toISOString();

  executeSql(
    'INSERT INTO "List" (id, name, description, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, description || null, auth.user.userId, createdAt, createdAt],
  );

  const list = queryRow(
    'SELECT * FROM "List" WHERE id = ? AND userId = ? LIMIT 1',
    [id, auth.user.userId],
  );

  return ok({ list }, 201);
}
