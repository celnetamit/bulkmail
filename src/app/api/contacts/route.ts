import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow, queryRows } from '@/lib/sqlite';
import { isValidEmailAddress, normalizeEmailAddress } from '@/lib/email-address';

const ALLOWED_STATUSES = new Set(['SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED']);
const DEFAULT_PAGE_SIZE = 10;

function parsePagination(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get('pageSize') || DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE),
  );
  const search = (url.searchParams.get('search') || '').trim();
  const sort = (url.searchParams.get('sort') || 'createdAt').trim();
  const order = ((url.searchParams.get('order') || 'desc').trim().toLowerCase() === 'asc' ? 'asc' : 'desc') as
    | 'asc'
    | 'desc';
  return { page, pageSize, search, sort, order };
}

function getSortClause(sort: string, order: 'asc' | 'desc') {
  const allowedSorts: Record<string, string> = {
    createdAt: `c."createdAt" ${order.toUpperCase()}`,
    email: `LOWER(c.email) ${order.toUpperCase()}, c."createdAt" DESC`,
    status: `c.status ${order.toUpperCase()}, c."createdAt" DESC`,
    firstName: `LOWER(COALESCE(c."firstName", '')) ${order.toUpperCase()}, c."createdAt" DESC`,
    lastName: `LOWER(COALESCE(c."lastName", '')) ${order.toUpperCase()}, c."createdAt" DESC`,
  };

  return allowedSorts[sort] || allowedSorts.createdAt;
}

async function assertOwnedList(listId: string, userId: string) {
  return queryRow<{ id: string }>(
    'SELECT id FROM "List" WHERE id = ? AND userId = ? LIMIT 1',
    [listId, userId],
  );
}

export async function GET(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const listId = searchParams.get('listId')?.trim() || '';
  const { page, pageSize, search, sort, order } = parsePagination(new URL(request.url));
  const offset = (page - 1) * pageSize;
  const searchTerm = search ? `%${search.toLowerCase()}%` : '';
  const searchClause = search
    ? "AND (LOWER(c.email) LIKE ? OR LOWER(COALESCE(c.\"firstName\", '')) LIKE ? OR LOWER(COALESCE(c.\"lastName\", '')) LIKE ? OR LOWER(c.status) LIKE ?)"
    : '';

  const countParams = listId
    ? [auth.user.userId, listId, ...(search ? [searchTerm, searchTerm, searchTerm, searchTerm] : [])]
    : [auth.user.userId, ...(search ? [searchTerm, searchTerm, searchTerm, searchTerm] : [])];

  const totalRow = queryRow<{ total: number }>(
    `
      SELECT COUNT(*) as total
      FROM "Contact" c
      INNER JOIN "List" l ON l.id = c.listId
      WHERE l.userId = ?
      ${listId ? 'AND c.listId = ?' : ''}
      ${searchClause}
    `,
    countParams,
  );

  const contacts = queryRows(
    `
      SELECT c.id, c.email, c.firstName, c.lastName, c.status, c.createdAt, c.updatedAt, l.id as listId, l.name as listName
      FROM "Contact" c
      INNER JOIN "List" l ON l.id = c.listId
      WHERE l.userId = ?
      ${listId ? 'AND c.listId = ?' : ''}
      ${searchClause}
      ORDER BY ${getSortClause(sort, order)}
      LIMIT ? OFFSET ?
    `,
    listId
      ? [
          auth.user.userId,
          listId,
          ...(search ? [searchTerm, searchTerm, searchTerm, searchTerm] : []),
          pageSize,
          offset,
        ]
      : [auth.user.userId, ...(search ? [searchTerm, searchTerm, searchTerm, searchTerm] : []), pageSize, offset],
  );

  return ok({
    contacts,
    pagination: {
      page,
      pageSize,
      total: totalRow?.total ?? 0,
      totalPages: Math.max(1, Math.ceil((totalRow?.total ?? 0) / pageSize)),
      search,
      sort,
      order,
    },
  });
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

  const listId =
    typeof body === 'object' && body !== null && 'listId' in body
      ? String((body as Record<string, unknown>).listId).trim()
      : '';

  const email =
    typeof body === 'object' && body !== null && 'email' in body
      ? normalizeEmailAddress(String((body as Record<string, unknown>).email))
      : '';

  const firstName =
    typeof body === 'object' && body !== null && 'firstName' in body
      ? String((body as Record<string, unknown>).firstName || '').trim()
      : '';

  const lastName =
    typeof body === 'object' && body !== null && 'lastName' in body
      ? String((body as Record<string, unknown>).lastName || '').trim()
      : '';

  if (!listId || !email) return fail('listId and email are required.', 400);
  if (!isValidEmailAddress(email)) return fail('Invalid email address.', 400);

  const ownedList = await assertOwnedList(listId, auth.user.userId);
  if (!ownedList) return fail('List not found.', 404);

  const existingContact = queryRow<{ id: string; listId: string }>(
    `
      SELECT c.id, c.listId
      FROM "Contact" c
      INNER JOIN "List" l ON l.id = c.listId
      WHERE c.email = ? AND l.userId = ?
      LIMIT 1
    `,
    [email, auth.user.userId],
  );

  if (existingContact) {
    return fail(
      existingContact.listId === listId
        ? 'Contact already exists in this list.'
        : 'Email already exists in another list.',
      409,
    );
  }

  const id = crypto.randomUUID().replace(/-/g, '');
  const createdAt = new Date().toISOString();
  executeSql(
    'INSERT INTO "Contact" (id, listId, email, firstName, lastName, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, listId, email, firstName || null, lastName || null, 'SUBSCRIBED', createdAt, createdAt],
  );

  const contact = queryRow(
    'SELECT * FROM "Contact" WHERE id = ? LIMIT 1',
    [id],
  );

  return ok({ contact }, 201);
}

export async function PUT(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  const listId =
    typeof body === 'object' && body !== null && 'listId' in body
      ? String((body as Record<string, unknown>).listId).trim()
      : '';

  const csv =
    typeof body === 'object' && body !== null && 'csv' in body
      ? String((body as Record<string, unknown>).csv)
      : '';

  if (!listId || !csv.trim()) return fail('listId and csv are required.', 400);

  const ownedList = await assertOwnedList(listId, auth.user.userId);
  if (!ownedList) return fail('List not found.', 404);

  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return fail('CSV has no rows.', 400);

  const startsWithHeader = /^email\s*(,|$)/i.test(lines[0]);
  const dataLines = startsWithHeader ? lines.slice(1) : lines;

  let created = 0;
  let skipped = 0;
  let invalid = 0;
  let duplicates = 0;

  for (const line of dataLines) {
    const [emailRaw, firstRaw, lastRaw] = line.split(',').map((part) => (part || '').trim());
    const email = normalizeEmailAddress(emailRaw || '');

    if (!email) {
      skipped += 1;
      continue;
    }

    if (!isValidEmailAddress(email)) {
      invalid += 1;
      skipped += 1;
      continue;
    }

    const existingContact = queryRow<{ id: string }>(
      `
        SELECT c.id
        FROM "Contact" c
        INNER JOIN "List" l ON l.id = c.listId
        WHERE c.email = ? AND l.userId = ?
        LIMIT 1
      `,
      [email, auth.user.userId],
    );

    if (existingContact) {
      duplicates += 1;
      skipped += 1;
      continue;
    }

    const id = crypto.randomUUID().replace(/-/g, '');
    const createdAt = new Date().toISOString();
    executeSql(
      'INSERT INTO "Contact" (id, listId, email, firstName, lastName, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, listId, email, firstRaw || null, lastRaw || null, 'SUBSCRIBED', createdAt, createdAt],
    );
    created += 1;
  }

  return ok({ created, skipped, duplicates, invalid });
}
