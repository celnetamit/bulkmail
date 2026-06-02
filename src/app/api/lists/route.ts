import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow, queryRows } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_PAGE_SIZE = 8;

function parsePagination(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);
  const pageSize = Math.min(
    50,
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
    createdAt: `l."createdAt" ${order.toUpperCase()}`,
    name: `LOWER(l.name) ${order.toUpperCase()}, l."createdAt" DESC`,
    contactsCount: `(SELECT COUNT(*) FROM "Contact" c WHERE c.listId = l.id) ${order.toUpperCase()}, l."createdAt" DESC`,
    campaignsCount: `(SELECT COUNT(*) FROM "Campaign" ca WHERE ca.listId = l.id) ${order.toUpperCase()}, l."createdAt" DESC`,
  };

  return allowedSorts[sort] || allowedSorts.createdAt;
}

export async function GET(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const url = new URL(request.url);
  const { page, pageSize, search, sort, order } = parsePagination(url);
  const offset = (page - 1) * pageSize;
  const searchTerm = search ? `%${search.toLowerCase()}%` : '';
  const searchClause = search
    ? "AND (LOWER(l.name) LIKE ? OR LOWER(COALESCE(l.description, '')) LIKE ?)"
    : '';
  const params = search ? [auth.user.userId, searchTerm, searchTerm] : [auth.user.userId];

  const totalRow = queryRow<{ total: number }>(
    `
      SELECT COUNT(*) as total
      FROM "List" l
      WHERE l.userId = ?
      ${searchClause}
    `,
    params,
  );

  const lists = queryRows<{
    id: string;
    name: string;
    description: string | null;
    userId: string;
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
        l.userId,
        l.createdAt,
        l.updatedAt,
        (SELECT COUNT(*) FROM "Contact" c WHERE c.listId = l.id) as contactsCount,
        (SELECT COUNT(*) FROM "Campaign" ca WHERE ca.listId = l.id) as campaignsCount
      FROM "List" l
      WHERE l.userId = ?
      ${searchClause}
      ORDER BY ${getSortClause(sort, order)}
      LIMIT ? OFFSET ?
    `,
    search
      ? [auth.user.userId, searchTerm, searchTerm, pageSize, offset]
      : [auth.user.userId, pageSize, offset],
  );

  return ok({
    lists,
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

  const name =
    typeof body === 'object' && body !== null && 'name' in body
      ? String((body as Record<string, unknown>).name).trim()
      : '';

  const description =
    typeof body === 'object' && body !== null && 'description' in body
      ? String((body as Record<string, unknown>).description || '').trim()
      : '';

  if (!name) {
    return fail('List name is required.', 400);
  }

  const id = crypto.randomUUID().replace(/-/g, '');
  const createdAt = new Date().toISOString();

  executeSql(
    'INSERT INTO "List" (id, name, description, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, description || null, auth.user.userId, createdAt, createdAt],
  );

  const list = queryRow(
    'SELECT * FROM "List" WHERE id = ? AND userId = ? LIMIT 1',
    [id, auth.user.userId],
  );

  return ok({ list }, 201);
}
