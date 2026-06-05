import { randomUUID } from 'node:crypto';

import { executeSql, queryRows } from '@/lib/sqlite';
import { isValidEmailAddress, normalizeEmailAddress } from '@/lib/email-address';

const ALLOWED_CONTACT_STATUSES = new Set(['SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED']);
const EXISTING_LOOKUP_CHUNK_SIZE = 400;
const INSERT_BATCH_SIZE = 100;

type ImportableContactInput = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  status?: string | null;
};

type ImportContactsIntoListOptions = {
  userId: string;
  listId: string;
  contacts: ImportableContactInput[];
  dedupeAcrossUserLists?: boolean;
};

type PreparedContact = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
};

function placeholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ');
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function normalizeStatus(status: string | null | undefined) {
  const normalized = String(status || 'SUBSCRIBED').trim().toUpperCase();
  return ALLOWED_CONTACT_STATUSES.has(normalized) ? normalized : 'SUBSCRIBED';
}

function buildExistingEmailQuery(count: number, dedupeAcrossUserLists: boolean) {
  if (dedupeAcrossUserLists) {
    return `
      SELECT c.email
      FROM "Contact" c
      INNER JOIN "List" l ON l.id = c."listId"
      WHERE l."userId" = ? AND c.email IN (${placeholders(count)})
    `;
  }

  return `
    SELECT email
    FROM "Contact"
    WHERE "listId" = ? AND email IN (${placeholders(count)})
  `;
}

function loadExistingEmails(listId: string, userId: string, emails: string[], dedupeAcrossUserLists: boolean) {
  const existing = new Set<string>();

  for (const emailChunk of chunk(emails, EXISTING_LOOKUP_CHUNK_SIZE)) {
    const rows = queryRows<{ email: string }>(
      buildExistingEmailQuery(emailChunk.length, dedupeAcrossUserLists),
      [dedupeAcrossUserLists ? userId : listId, ...emailChunk],
    );

    for (const row of rows) {
      existing.add(normalizeEmailAddress(String(row.email || '')));
    }
  }

  return existing;
}

function insertContacts(listId: string, contacts: PreparedContact[]) {
  let created = 0;

  for (const batch of chunk(contacts, INSERT_BATCH_SIZE)) {
    const createdAt = new Date().toISOString();
    const valuesSql = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const params = batch.flatMap((contact) => [
      randomUUID().replace(/-/g, ''),
      listId,
      contact.email,
      contact.firstName,
      contact.lastName,
      contact.status,
      createdAt,
      createdAt,
    ]);

    executeSql(
      `INSERT INTO "Contact" (id, "listId", email, "firstName", "lastName", status, "createdAt", "updatedAt") VALUES ${valuesSql}`,
      params,
    );

    created += batch.length;
  }

  return created;
}

export function importContactsIntoList({
  userId,
  listId,
  contacts,
  dedupeAcrossUserLists = true,
}: ImportContactsIntoListOptions) {
  let skipped = 0;
  let invalid = 0;
  let duplicates = 0;

  const seenInPayload = new Set<string>();
  const preparedContacts: PreparedContact[] = [];

  for (const input of contacts) {
    const email = normalizeEmailAddress(String(input?.email || ''));
    if (!email) {
      skipped += 1;
      continue;
    }

    if (!isValidEmailAddress(email)) {
      invalid += 1;
      skipped += 1;
      continue;
    }

    if (seenInPayload.has(email)) {
      duplicates += 1;
      skipped += 1;
      continue;
    }

    seenInPayload.add(email);
    preparedContacts.push({
      email,
      firstName: String(input?.firstName || '').trim() || null,
      lastName: String(input?.lastName || '').trim() || null,
      status: normalizeStatus(input?.status),
    });
  }

  if (preparedContacts.length === 0) {
    return { created: 0, skipped, duplicates, invalid };
  }

  const existingEmails = loadExistingEmails(
    listId,
    userId,
    preparedContacts.map((contact) => contact.email),
    dedupeAcrossUserLists,
  );

  const contactsToInsert: PreparedContact[] = [];
  for (const contact of preparedContacts) {
    if (existingEmails.has(contact.email)) {
      duplicates += 1;
      skipped += 1;
      continue;
    }

    contactsToInsert.push(contact);
  }

  const created = insertContacts(listId, contactsToInsert);
  return { created, skipped, duplicates, invalid };
}
