import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow, queryRows } from '@/lib/sqlite';
import { buildOwnerScope, isOwnedByViewer } from '@/lib/data-scope';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;
  const url = new URL(request.url);
  const ownerSelfOnly = url.searchParams.get('owner') === 'self';
  const ownerScope = ownerSelfOnly
    ? { clause: 't."userId" = ?', params: [auth.user.userId] as unknown[], scope: 'SELF' as const }
    : buildOwnerScope(auth.user, 't."userId"');

  const templates = queryRows<{
    id: string;
    name: string;
    subject: string;
    bodyHtml: string;
    userId: string;
    createdAt: string;
    updatedAt: string;
    ownerEmail: string;
    ownerName: string | null;
    ownerRole: string;
  }>(
    `
      SELECT
        t.id,
        t.name,
        t.subject,
        t."bodyHtml",
        t."userId",
        t."createdAt",
        t."updatedAt",
        u.email as ownerEmail,
        u.name as ownerName,
        u.role as ownerRole
      FROM "Template" t
      INNER JOIN "User" u ON u.id = t."userId"
      WHERE ${ownerScope.clause}
      ORDER BY t."createdAt" DESC
    `,
    ownerScope.params,
  );

  return ok({
    templates: templates.map((template) => ({
      ...template,
      owner: {
        id: template.userId,
        email: template.ownerEmail,
        name: template.ownerName,
        role: template.ownerRole,
      },
      isOwner: isOwnedByViewer(template.userId, auth.user),
    })),
    scope: ownerScope.scope,
  });
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
    'INSERT INTO "Template" (id, name, subject, "bodyHtml", "userId", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, name, subject, bodyHtml, auth.user.userId, createdAt, createdAt],
  );

  const template = queryRow(
    'SELECT * FROM "Template" WHERE id = ? AND "userId" = ? LIMIT 1',
    [id, auth.user.userId],
  );

  return ok({ template }, 201);
}
