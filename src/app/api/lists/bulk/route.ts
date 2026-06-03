import { randomUUID } from 'node:crypto';

import { requireUserFromCookies } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow, queryRows } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function uniqueIds(listIds: unknown) {
  if (!Array.isArray(listIds)) return [];
  return Array.from(new Set(listIds.map((value) => String(value).trim()).filter(Boolean)));
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
  const listIds = uniqueIds(typeof body === 'object' && body !== null ? (body as Record<string, unknown>).listIds : []);

  if (!action || !['archive', 'unarchive', 'duplicate'].includes(action)) {
    return fail('Invalid bulk action.', 400);
  }

  if (listIds.length === 0) {
    return fail('Select at least one list.', 400);
  }

  const ownedLists = queryRows<{
    id: string;
    name: string;
    description: string | null;
    isDefaultTestList: number | boolean;
    isArchived: number | boolean;
  }>(
    `
      SELECT id, name, description, CASE WHEN COALESCE("isDefaultTestList", FALSE) THEN 1 ELSE 0 END as "isDefaultTestList",
             CASE WHEN COALESCE("isArchived", FALSE) THEN 1 ELSE 0 END as "isArchived"
      FROM "List"
      WHERE "userId" = ? AND id IN (${placeholders(listIds.length)})
    `,
    [auth.user.userId, ...listIds],
  );

  if (ownedLists.length !== listIds.length) {
    return fail('One or more lists were not found.', 404);
  }

  const ownedById = new Map(ownedLists.map((list) => [list.id, list]));

  if (action === 'archive' || action === 'unarchive') {
    const archived = action === 'archive' ? 1 : 0;
    executeSql(
      `
        UPDATE "List"
        SET "isArchived" = ?, "isDefaultTestList" = CASE WHEN ? = 1 THEN FALSE ELSE "isDefaultTestList" END, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "userId" = ? AND id IN (${placeholders(listIds.length)})
      `,
      [archived, archived, auth.user.userId, ...listIds],
    );

    await recordAuditEvent({
      actorUserId: auth.user.userId,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: action === 'archive' ? 'list_bulk_archive' : 'list_bulk_unarchive',
      entityType: 'List',
      entityId: listIds[0],
      scopeType: 'SELF',
      metadata: { listIds, archived: action === 'archive' },
    });

    return ok({ success: true, action, listIds });
  }

  const createdListIds: string[] = [];
  for (const listId of listIds) {
    const source = ownedById.get(listId);
    if (!source) continue;

    const newId = randomUUID().replace(/-/g, '');
    const createdAt = new Date().toISOString();
    const newName = `${source.name} Copy`;

    executeSql(
      `
        INSERT INTO "List" (
          id, name, description, "userId", "isDefaultTestList", "isArchived", "createdAt", "updatedAt"
        ) VALUES (?, ?, ?, ?, FALSE, FALSE, ?, ?)
      `,
      [newId, newName, source.description, auth.user.userId, createdAt, createdAt],
    );

    const contacts = queryRows<{
      email: string;
      firstName: string | null;
      lastName: string | null;
      status: string;
    }>(
      `
        SELECT email, "firstName", "lastName", status
        FROM "Contact"
        WHERE "listId" = ?
        ORDER BY "createdAt" ASC
      `,
      [source.id],
    );

    const seen = new Set<string>();
    for (const contact of contacts) {
      const normalized = contact.email.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);

      executeSql(
        `
          INSERT INTO "Contact" (
            id, email, "firstName", "lastName", status, "listId", "createdAt", "updatedAt"
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          randomUUID().replace(/-/g, ''),
          normalized,
          contact.firstName,
          contact.lastName,
          contact.status || 'SUBSCRIBED',
          newId,
          createdAt,
          createdAt,
        ],
      );
    }

    createdListIds.push(newId);
  }

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'list_bulk_duplicate',
    entityType: 'List',
    entityId: createdListIds[0] || listIds[0],
    scopeType: 'SELF',
    metadata: {
      sourceListIds: listIds,
      createdListIds,
    },
  });

  const duplicatedLists = createdListIds
    .map((id) =>
      queryRow<{
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
            (SELECT COUNT(*) FROM "CampaignList" cl WHERE cl."listId" = l.id) as campaignsCount
          FROM "List" l
          WHERE l.id = ? AND l."userId" = ?
          LIMIT 1
        `,
        [id, auth.user.userId],
      ),
    )
    .filter(Boolean);

  return ok({
    success: true,
    action,
    listIds,
    createdListIds,
    lists: duplicatedLists,
  });
}
