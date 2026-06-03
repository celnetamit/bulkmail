import { requireUserFromCookies } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow, queryRows } from '@/lib/sqlite';
import { setDefaultTestList } from '@/lib/campaign-lists';
import { buildOwnerScope, isOwnedByViewer } from '@/lib/data-scope';

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
    campaignsCount: `(SELECT COUNT(*) FROM "CampaignList" cl WHERE cl.listId = l.id) ${order.toUpperCase()}, l."createdAt" DESC`,
  };

  return allowedSorts[sort] || allowedSorts.createdAt;
}

export async function GET(request: Request) {
  try {
    const auth = await requireUserFromCookies();
    if ('error' in auth) return auth.error;

    const url = new URL(request.url);
    const { page, pageSize, search, sort, order } = parsePagination(url);
    const all = url.searchParams.get('all') === 'true' || url.searchParams.get('all') === '1';
    const ownerSelfOnly = url.searchParams.get('owner') === 'self';
    const includeArchived = url.searchParams.get('includeArchived') === 'true' || url.searchParams.get('includeArchived') === '1';
    const offset = (page - 1) * pageSize;
    const searchTerm = search ? `%${search.toLowerCase()}%` : '';
    const searchClause = search
      ? "AND (LOWER(l.name) LIKE ? OR LOWER(COALESCE(l.description, '')) LIKE ?)"
      : '';
    const archivedClause = includeArchived ? '' : 'AND COALESCE(l.isArchived, FALSE) = FALSE';
    const ownerScope = ownerSelfOnly
      ? { clause: 'l.userId = ?', params: [auth.user.userId] as unknown[], scope: 'SELF' as const }
      : buildOwnerScope(auth.user, 'l.userId');
    const params = search ? [...ownerScope.params, searchTerm, searchTerm] : [...ownerScope.params];

    const totalRow = queryRow<{ total: number }>(
      `
        SELECT COUNT(*) as total
        FROM "List" l
        WHERE ${ownerScope.clause}
        ${archivedClause}
        ${searchClause}
      `,
      params,
    );

    const lists = queryRows<{
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
          l.userId,
          CASE WHEN COALESCE(l.isDefaultTestList, FALSE) THEN 1 ELSE 0 END as isDefaultTestList,
          CASE WHEN COALESCE(l.isArchived, FALSE) THEN 1 ELSE 0 END as isArchived,
          l.createdAt,
          l.updatedAt,
          (SELECT COUNT(*) FROM "Contact" c WHERE c.listId = l.id) as contactsCount,
          (SELECT COUNT(*) FROM "CampaignList" cl WHERE cl.listId = l.id) as campaignsCount,
          u.email as ownerEmail,
          u.name as ownerName,
          u.role as ownerRole
        FROM "List" l
        INNER JOIN "User" u ON u.id = l.userId
        WHERE ${ownerScope.clause}
        ${archivedClause}
        ${searchClause}
        ORDER BY ${getSortClause(sort, order)}
        ${all ? '' : 'LIMIT ? OFFSET ?'}
      `,
      all
        ? search
          ? [...ownerScope.params, searchTerm, searchTerm]
          : [...ownerScope.params]
        : search
          ? [...ownerScope.params, searchTerm, searchTerm, pageSize, offset]
          : [...ownerScope.params, pageSize, offset],
    );

    const effectivePageSize = all ? Math.max(1, totalRow?.total ?? lists.length ?? 1) : pageSize;

    return ok({
      lists: lists.map((list) => ({
        ...list,
        owner: {
          id: list.userId,
          email: list.ownerEmail,
          name: list.ownerName,
          role: list.ownerRole,
        },
        isOwner: isOwnedByViewer(list.userId, auth.user),
      })),
      scope: ownerScope.scope,
      pagination: {
        page,
        pageSize: effectivePageSize,
        total: totalRow?.total ?? 0,
        totalPages: Math.max(1, Math.ceil((totalRow?.total ?? 0) / effectivePageSize)),
        search,
        sort,
        order,
      },
    });
  } catch (error) {
    console.error('lists_get_failed', error);
    return fail('Failed to load lists.', 500);
  }
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
  const isDefaultTestList =
    typeof body === 'object' && body !== null && 'isDefaultTestList' in body
      ? Boolean((body as Record<string, unknown>).isDefaultTestList)
      : false;

  if (!name) {
    return fail('List name is required.', 400);
  }

  const id = crypto.randomUUID().replace(/-/g, '');
  const createdAt = new Date().toISOString();

  executeSql(
    'INSERT INTO "List" (id, name, description, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, description || null, auth.user.userId, createdAt, createdAt],
  );

  if (isDefaultTestList) {
    setDefaultTestList(id, auth.user.userId);
  }

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'list_create',
    entityType: 'List',
    entityId: id,
    scopeType: 'SELF',
    metadata: {
      name,
      description: description || null,
      isDefaultTestList,
    },
  });

  const list = queryRow(
    'SELECT * FROM "List" WHERE id = ? AND userId = ? LIMIT 1',
    [id, auth.user.userId],
  );

  return ok({ list }, 201);
}
