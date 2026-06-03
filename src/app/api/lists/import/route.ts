import { randomUUID } from 'node:crypto';

import { requireUserFromCookies } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { isValidEmailAddress, normalizeEmailAddress } from '@/lib/email-address';
import { executeSql, queryRow } from '@/lib/sqlite';
import { setDefaultTestList } from '@/lib/campaign-lists';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ImportedContact = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  status?: string | null;
};

type ImportedList = {
  name: string;
  description?: string | null;
  isDefaultTestList?: boolean;
  isArchived?: boolean;
  contacts?: ImportedContact[];
};

export async function POST(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  const lists = typeof body === 'object' && body !== null && Array.isArray((body as Record<string, unknown>).lists)
    ? ((body as Record<string, unknown>).lists as ImportedList[])
    : [];

  if (lists.length === 0) {
    return fail('No lists provided for import.', 400);
  }

  const importedListIds: string[] = [];

  for (const input of lists) {
    const name = String(input?.name || '').trim();
    const description = String(input?.description || '').trim();
    if (!name) {
      return fail('Each imported list needs a name.', 400);
    }

    const id = randomUUID().replace(/-/g, '');
    const createdAt = new Date().toISOString();
    const isArchived = Boolean(input?.isArchived);

    executeSql(
      `
        INSERT INTO "List" (
          id, name, description, "userId", "isDefaultTestList", "isArchived", "createdAt", "updatedAt"
        ) VALUES (?, ?, ?, ?, FALSE, ?, ?, ?)
      `,
      [id, name, description || null, auth.user.userId, isArchived ? 1 : 0, createdAt, createdAt],
    );

    const contacts = Array.isArray(input?.contacts) ? input.contacts : [];
    const seen = new Set<string>();
    for (const contact of contacts) {
      const normalized = normalizeEmailAddress(String(contact?.email || ''));
      if (!normalized || !isValidEmailAddress(normalized) || seen.has(normalized)) continue;
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
          String(contact?.firstName || '').trim() || null,
          String(contact?.lastName || '').trim() || null,
          contact?.status || 'SUBSCRIBED',
          id,
          createdAt,
          createdAt,
        ],
      );
    }

    if (input?.isDefaultTestList && !isArchived) {
      setDefaultTestList(id, auth.user.userId);
    }

    importedListIds.push(id);
  }

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'list_import',
    entityType: 'List',
    entityId: importedListIds[0],
    scopeType: 'SELF',
    metadata: {
      importedCount: importedListIds.length,
      importedListIds,
    },
  });

  const firstList = importedListIds[0]
    ? queryRow(
        'SELECT id, name, description, "userId", "createdAt", "updatedAt" FROM "List" WHERE id = ? AND "userId" = ? LIMIT 1',
        [importedListIds[0], auth.user.userId],
      )
    : null;

  return ok({
    success: true,
    importedCount: importedListIds.length,
    importedListIds,
    list: firstList,
  }, 201);
}
