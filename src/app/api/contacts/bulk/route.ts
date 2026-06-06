import { requireUserFromCookies } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRows } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function uniqueIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry).trim()).filter(Boolean)));
}

function placeholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ');
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

  const action = typeof body === 'object' && body !== null && 'action' in body ? String((body as Record<string, unknown>).action).trim() : '';
  const contactIds = uniqueIds(typeof body === 'object' && body !== null ? (body as Record<string, unknown>).contactIds : []);

  if (action !== 'delete') {
    return fail('Invalid bulk action.', 400);
  }

  if (contactIds.length === 0) {
    return fail('Select at least one email.', 400);
  }

  const ownedContacts = queryRows<{ id: string; email: string; listId: string }>(
    `
      SELECT c.id, c.email, c."listId"
      FROM "Contact" c
      INNER JOIN "List" l ON l.id = c."listId"
      WHERE l."userId" = ? AND c.id IN (${placeholders(contactIds.length)})
    `,
    [auth.user.userId, ...contactIds],
  );

  if (ownedContacts.length !== contactIds.length) {
    return fail('One or more contacts were not found.', 404);
  }

  executeSql(
    `DELETE FROM "Contact" WHERE id IN (${placeholders(contactIds.length)})`,
    contactIds,
  );

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'contact_bulk_delete',
    entityType: 'Contact',
    entityId: contactIds[0],
    scopeType: 'SELF',
    metadata: {
      contactIds,
      deletedCount: contactIds.length,
    },
  });

  return ok({ success: true, action, contactIds });
}
