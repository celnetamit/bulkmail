import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow } from '@/lib/sqlite';
import { buildOwnerScope, isOwnedByViewer } from '@/lib/data-scope';

type Params = { params: { id: string } };

export async function GET(_: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;
  const ownerScope = buildOwnerScope(auth.user, 't."userId"');

  const template = queryRow<{
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
      WHERE t.id = ? AND ${ownerScope.clause}
      LIMIT 1
    `,
    [params.id, ...ownerScope.params],
  );
  if (!template) return fail('Template not found.', 404);

  return ok({
    template: {
      ...template,
      owner: {
        id: template.userId,
        email: template.ownerEmail,
        name: template.ownerName,
        role: template.ownerRole,
      },
      isOwner: isOwnedByViewer(template.userId, auth.user),
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

  if (!name || !subject || !bodyHtml) return fail('name, subject and bodyHtml are required.', 400);

  const existing = queryRow<{ id: string }>(
    'SELECT id FROM "Template" WHERE id = ? AND "userId" = ? LIMIT 1',
    [params.id, auth.user.userId],
  );
  if (!existing) return fail('Template not found.', 404);

  executeSql(
    'UPDATE "Template" SET name = ?, subject = ?, "bodyHtml" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ? AND "userId" = ?',
    [name, subject, bodyHtml, params.id, auth.user.userId],
  );

  const template = queryRow(
    'SELECT * FROM "Template" WHERE id = ? AND "userId" = ? LIMIT 1',
    [params.id, auth.user.userId],
  );

  return ok({ template });
}

export async function DELETE(_: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const existing = queryRow<{ id: string }>(
    'SELECT id FROM "Template" WHERE id = ? AND "userId" = ? LIMIT 1',
    [params.id, auth.user.userId],
  );
  if (!existing) return fail('Template not found.', 404);

  executeSql('DELETE FROM "Template" WHERE id = ? AND "userId" = ?', [params.id, auth.user.userId]);
  return ok({ success: true });
}
