import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow, queryRows } from '@/lib/sqlite';

export async function GET() {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const templates = queryRows<{
    id: string;
    name: string;
    subject: string;
    bodyHtml: string;
    userId: string;
    createdAt: string;
    updatedAt: string;
  }>(
    `
      SELECT id, name, subject, bodyHtml, userId, createdAt, updatedAt
      FROM "Template"
      WHERE userId = ?
      ORDER BY createdAt DESC
    `,
    [auth.user.userId],
  );

  return ok({ templates });
}

export async function POST(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try { body = await request.json(); } catch { return fail('Invalid JSON body.', 400); }

  const name = typeof body === 'object' && body && 'name' in body ? String((body as Record<string, unknown>).name).trim() : '';
  const subject = typeof body === 'object' && body && 'subject' in body ? String((body as Record<string, unknown>).subject).trim() : '';
  const bodyHtml = typeof body === 'object' && body && 'bodyHtml' in body ? String((body as Record<string, unknown>).bodyHtml).trim() : '';

  if (!name || !subject || !bodyHtml) return fail('name, subject and bodyHtml are required.', 400);

  const id = crypto.randomUUID().replace(/-/g, '');
  const createdAt = new Date().toISOString();
  executeSql(
    'INSERT INTO "Template" (id, name, subject, bodyHtml, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, name, subject, bodyHtml, auth.user.userId, createdAt, createdAt],
  );

  const template = queryRow(
    'SELECT * FROM "Template" WHERE id = ? AND userId = ? LIMIT 1',
    [id, auth.user.userId],
  );

  return ok({ template }, 201);
}
