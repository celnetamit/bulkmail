import { requireUserFromCookies } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { queryRows } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseIds(raw: string | null) {
  return Array.from(new Set((raw || '').split(',').map((value) => value.trim()).filter(Boolean)));
}

function placeholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ');
}

export async function GET(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const url = new URL(request.url);
  const listIds = parseIds(url.searchParams.get('listIds') || url.searchParams.get('ids'));
  if (listIds.length === 0) {
    return fail('Select at least one list to export.', 400);
  }

  const lists = queryRows<{
    id: string;
    name: string;
    description: string | null;
    userId: string;
    isDefaultTestList: number | boolean;
    isArchived: number | boolean;
    createdAt: string;
    updatedAt: string;
  }>(
    `
      SELECT
        id,
        name,
        description,
        "userId",
        CASE WHEN COALESCE("isDefaultTestList", FALSE) THEN 1 ELSE 0 END as "isDefaultTestList",
        CASE WHEN COALESCE("isArchived", FALSE) THEN 1 ELSE 0 END as "isArchived",
        "createdAt",
        "updatedAt"
      FROM "List"
      WHERE "userId" = ? AND id IN (${placeholders(listIds.length)})
    `,
    [auth.user.userId, ...listIds],
  );

  if (lists.length !== listIds.length) {
    return fail('One or more lists were not found.', 404);
  }

  const contactsByList = new Map<string, {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  }[]>();

  for (const listId of listIds) {
    const contacts = queryRows<{
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      status: string;
      createdAt: string;
      updatedAt: string;
    }>(
      `
        SELECT id, email, "firstName", "lastName", status, "createdAt", "updatedAt"
        FROM "Contact"
        WHERE "listId" = ?
        ORDER BY "createdAt" ASC
      `,
      [listId],
    );
    contactsByList.set(listId, contacts);
  }

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'list_export',
    entityType: 'List',
    entityId: listIds[0],
    scopeType: 'SELF',
    metadata: { listIds, count: listIds.length },
  });

  return ok({
    exportedAt: new Date().toISOString(),
    lists: listIds.map((listId) => {
      const list = lists.find((entry) => entry.id === listId);
      return list
        ? {
            ...list,
            contacts: contactsByList.get(listId) || [],
          }
        : null;
    }).filter(Boolean),
  });
}
