import { requireUserFromCookies } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow } from '@/lib/sqlite';
import { setDefaultTestList } from '@/lib/campaign-lists';
import { buildOwnerScope, isOwnedByViewer } from '@/lib/data-scope';

type Params = { params: { id: string } };

export async function GET(_: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;
  const ownerScope = buildOwnerScope(auth.user, 'l."userId"');

  const list = queryRow<{
    id: string;
    name: string;
    description: string | null;
    userId: string;
    isDefaultTestList: number | boolean;
    isArchived: number | boolean;
    createdAt: string;
    updatedAt: string;
    contactsCount: number;
    campaignsCount: number;
    ownerEmail: string;
    ownerName: string | null;
    ownerRole: string;
  }>(
    `
      SELECT
        l.id,
        l.name,
        l.description,
        l."userId",
        CASE WHEN COALESCE(l."isDefaultTestList", FALSE) THEN 1 ELSE 0 END as "isDefaultTestList",
        CASE WHEN COALESCE(l."isArchived", FALSE) THEN 1 ELSE 0 END as "isArchived",
        l."createdAt",
        l."updatedAt",
        (SELECT COUNT(*) FROM "Contact" c WHERE c."listId" = l.id) as contactsCount,
        (SELECT COUNT(*) FROM "CampaignList" cl WHERE cl."listId" = l.id) as campaignsCount,
        u.email as ownerEmail,
        u.name as ownerName,
        u.role as ownerRole
      FROM "List" l
      INNER JOIN "User" u ON u.id = l."userId"
      WHERE l.id = ? AND ${ownerScope.clause}
      LIMIT 1
    `,
    [params.id, ...ownerScope.params],
  );

  if (!list) return fail('List not found.', 404);
  return ok({
    list: {
      ...list,
      owner: {
        id: list.userId,
        email: list.ownerEmail,
        name: list.ownerName,
        role: list.ownerRole,
      },
      isOwner: isOwnedByViewer(list.userId, auth.user),
    },
    scope: ownerScope.scope,
  });
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

  const hasDescription = typeof body === 'object' && body !== null && 'description' in body;
  const description = hasDescription
    ? String((body as Record<string, unknown>).description || '').trim()
    : '';
  const isDefaultTestList = typeof body === 'object' && body !== null && 'isDefaultTestList' in body
    ? Boolean((body as Record<string, unknown>).isDefaultTestList)
    : undefined;

  if (!name) return fail('List name is required.', 400);

  const existing = queryRow<{ id: string }>(
    'SELECT id FROM "List" WHERE id = ? AND "userId" = ? LIMIT 1',
    [params.id, auth.user.userId],
  );

  if (!existing) return fail('List not found.', 404);

  // Only overwrite description when the client actually sent the field, so a
  // rename-only PATCH (no `description` key) does not erase an existing value.
  const assignments = ['name = ?'];
  const updateParams: unknown[] = [name];
  if (hasDescription) {
    assignments.push('description = ?');
    updateParams.push(description || null);
  }
  executeSql(
    `UPDATE "List" SET ${assignments.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ? AND "userId" = ?`,
    [...updateParams, params.id, auth.user.userId],
  );

  if (isDefaultTestList === true) {
    setDefaultTestList(params.id, auth.user.userId);
  } else if (isDefaultTestList === false) {
    executeSql(
      'UPDATE "List" SET "isDefaultTestList" = FALSE, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ? AND "userId" = ?',
      [params.id, auth.user.userId],
    );
  }

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'list_update',
    entityType: 'List',
    entityId: params.id,
    scopeType: 'SELF',
    metadata: {
      changedFields: ['name', 'description', 'isDefaultTestList'].filter((field) =>
        field === 'name' ? true : field === 'description' ? hasDescription : isDefaultTestList !== undefined,
      ),
      isDefaultTestList,
    },
  });

  const list = queryRow(
    'SELECT * FROM "List" WHERE id = ? AND "userId" = ? LIMIT 1',
    [params.id, auth.user.userId],
  );

  return ok({ list });
}

export async function DELETE(_: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const existing = queryRow<{ id: string }>(
    'SELECT id FROM "List" WHERE id = ? AND "userId" = ? LIMIT 1',
    [params.id, auth.user.userId],
  );

  if (!existing) return fail('List not found.', 404);

  executeSql('DELETE FROM "List" WHERE id = ? AND "userId" = ?', [params.id, auth.user.userId]);
  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'list_delete',
    entityType: 'List',
    entityId: params.id,
    scopeType: 'SELF',
  });
  return ok({ success: true });
}
