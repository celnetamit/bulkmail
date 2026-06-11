import { queryRow, queryRows } from '@/lib/sqlite';

export type OverlapFilter = 'all' | 'mixed' | 'unsubscribed';
export type OverlapSort = 'users' | 'records' | 'subscribed' | 'unsubscribed' | 'bounced' | 'email';

export const OVERLAP_PAGE_SIZE = 15;

export type OverlapRow = {
  email: string;
  userCount: number;
  recordCount: number;
  subscribedCount: number;
  unsubscribedCount: number;
  bouncedCount: number;
};

export type OverlapScope = {
  from: string | null;
  to: string | null;
  teamId: string | null;
  userId: string | null;
};

export function normalizeOverlapFilter(value: string | null): OverlapFilter {
  if (value === 'mixed' || value === 'unsubscribed') return value;
  return 'all';
}

export function normalizePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export function normalizeOverlapSort(value: string | null): OverlapSort {
  if (
    value === 'users' ||
    value === 'records' ||
    value === 'subscribed' ||
    value === 'unsubscribed' ||
    value === 'bounced' ||
    value === 'email'
  ) {
    return value;
  }
  return 'users';
}

function overlapCondition(filter: OverlapFilter) {
  if (filter === 'mixed') {
    return `WHERE "unsubscribedCount" > 0 AND "subscribedCount" > 0`;
  }
  if (filter === 'unsubscribed') {
    return `WHERE "unsubscribedCount" > 0`;
  }
  return '';
}

function overlapOrderBy(sort: OverlapSort) {
  if (sort === 'records') return `"recordCount" DESC, "userCount" DESC, email ASC`;
  if (sort === 'subscribed') return `"subscribedCount" DESC, "userCount" DESC, email ASC`;
  if (sort === 'unsubscribed') return `"unsubscribedCount" DESC, "userCount" DESC, email ASC`;
  if (sort === 'bounced') return `"bouncedCount" DESC, "userCount" DESC, email ASC`;
  if (sort === 'email') return `email ASC, "userCount" DESC, "recordCount" DESC`;
  return `"userCount" DESC, "recordCount" DESC, email ASC`;
}

function normalizeScope(scope?: Partial<OverlapScope>): OverlapScope {
  return {
    from: scope?.from || null,
    to: scope?.to || null,
    teamId: scope?.teamId || null,
    userId: scope?.userId || null,
  };
}

function buildOverlapQueryParts(scope?: Partial<OverlapScope>) {
  const normalizedScope = normalizeScope(scope);
  const selectParams: unknown[] = [];
  const whereParams: unknown[] = [];
  const whereClauses: string[] = [];

  if (normalizedScope.from) {
    whereClauses.push('c."createdAt" >= ?');
    whereParams.push(`${normalizedScope.from}T00:00:00.000Z`);
  }

  if (normalizedScope.to) {
    const end = new Date(`${normalizedScope.to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    whereClauses.push('c."createdAt" < ?');
    whereParams.push(end.toISOString());
  }

  const scopedTeamSelect = normalizedScope.teamId
    ? `COALESCE(SUM(CASE WHEN tm."teamId" = ? THEN 1 ELSE 0 END), 0) as "scopedTeamRecordCount",`
    : `0 as "scopedTeamRecordCount",`;
  if (normalizedScope.teamId) selectParams.push(normalizedScope.teamId);

  const scopedUserSelect = normalizedScope.userId
    ? `COALESCE(SUM(CASE WHEN l."userId" = ? THEN 1 ELSE 0 END), 0) as "scopedUserRecordCount",`
    : `0 as "scopedUserRecordCount",`;
  if (normalizedScope.userId) selectParams.push(normalizedScope.userId);

  const scopeWhereClauses: string[] = [];
  if (normalizedScope.teamId) scopeWhereClauses.push(`"scopedTeamRecordCount" > 0`);
  if (normalizedScope.userId) scopeWhereClauses.push(`"scopedUserRecordCount" > 0`);

  return {
    params: [...selectParams, ...whereParams],
    normalizedScope,
    scopeWhereSql: scopeWhereClauses.length > 0 ? scopeWhereClauses.join(' AND ') : '1=1',
    cte: `
    WITH shared_emails AS (
      SELECT
        LOWER(c.email) as email,
        COUNT(*) as "recordCount",
        COUNT(DISTINCT l."userId") as "userCount",
        COALESCE(SUM(CASE WHEN c.status = 'SUBSCRIBED' THEN 1 ELSE 0 END), 0) as "subscribedCount",
        COALESCE(SUM(CASE WHEN c.status = 'UNSUBSCRIBED' THEN 1 ELSE 0 END), 0) as "unsubscribedCount",
        COALESCE(SUM(CASE WHEN c.status = 'BOUNCED' THEN 1 ELSE 0 END), 0) as "bouncedCount",
        ${scopedTeamSelect}
        ${scopedUserSelect}
      FROM "Contact" c
      INNER JOIN "List" l ON l.id = c."listId"
      LEFT JOIN "TeamMember" tm ON tm."userId" = l."userId"
      ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
      GROUP BY LOWER(c.email)
      HAVING COUNT(DISTINCT l."userId") > 1
    )
  `,
  };
}

export function getOverlapAnalytics({
  filter,
  page,
  sort,
  scope,
}: {
  filter: OverlapFilter;
  page: number;
  sort: OverlapSort;
  scope?: Partial<OverlapScope>;
}) {
  const queryParts = buildOverlapQueryParts(scope);
  const totals =
    queryRow<{
      repeatedEmails: number;
      repeatedContactRecords: number;
      sharedEmailsWithUnsubscribes: number;
      mixedStatusSharedEmails: number;
      fullySuppressedSharedEmails: number;
    }>(
      `
        ${queryParts.cte}
        SELECT
          COUNT(*) as "repeatedEmails",
          COALESCE(SUM("recordCount"), 0) as "repeatedContactRecords",
          COALESCE(SUM(CASE WHEN "unsubscribedCount" > 0 THEN 1 ELSE 0 END), 0) as "sharedEmailsWithUnsubscribes",
          COALESCE(SUM(CASE WHEN "unsubscribedCount" > 0 AND "subscribedCount" > 0 THEN 1 ELSE 0 END), 0) as "mixedStatusSharedEmails",
          COALESCE(SUM(CASE WHEN "subscribedCount" = 0 AND ("unsubscribedCount" > 0 OR "bouncedCount" > 0) THEN 1 ELSE 0 END), 0) as "fullySuppressedSharedEmails"
        FROM shared_emails
        WHERE ${queryParts.scopeWhereSql}
      `,
      queryParts.params,
    ) || {
      repeatedEmails: 0,
      repeatedContactRecords: 0,
      sharedEmailsWithUnsubscribes: 0,
      mixedStatusSharedEmails: 0,
      fullySuppressedSharedEmails: 0,
    };

  const matchingTotal =
    queryRow<{ count: number }>(
      `
        ${queryParts.cte}
        SELECT COUNT(*) as count
        FROM shared_emails
        WHERE ${queryParts.scopeWhereSql}
        ${overlapCondition(filter).replace('WHERE', 'AND')}
      `,
      queryParts.params,
    )?.count || 0;

  const totalPages = Math.max(1, Math.ceil(Number(matchingTotal || 0) / OVERLAP_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const topSharedEmails = queryRows<OverlapRow>(
    `
      ${queryParts.cte}
      SELECT
        email,
        "recordCount",
        "userCount",
        "subscribedCount",
        "unsubscribedCount",
        "bouncedCount"
      FROM shared_emails
      WHERE ${queryParts.scopeWhereSql}
      ${overlapCondition(filter).replace('WHERE', 'AND')}
      ORDER BY ${overlapOrderBy(sort)}
      LIMIT ${OVERLAP_PAGE_SIZE}
      OFFSET ${(currentPage - 1) * OVERLAP_PAGE_SIZE}
    `,
    queryParts.params,
  ).map((row) => ({
    email: row.email,
    userCount: Number(row.userCount || 0),
    recordCount: Number(row.recordCount || 0),
    subscribedCount: Number(row.subscribedCount || 0),
    unsubscribedCount: Number(row.unsubscribedCount || 0),
    bouncedCount: Number(row.bouncedCount || 0),
  }));

  return {
    repeatedEmails: Number(totals.repeatedEmails || 0),
    repeatedContactRecords: Number(totals.repeatedContactRecords || 0),
    sharedEmailsWithUnsubscribes: Number(totals.sharedEmailsWithUnsubscribes || 0),
    mixedStatusSharedEmails: Number(totals.mixedStatusSharedEmails || 0),
    fullySuppressedSharedEmails: Number(totals.fullySuppressedSharedEmails || 0),
    matchingTotal: Number(matchingTotal || 0),
    page: currentPage,
    pageSize: OVERLAP_PAGE_SIZE,
    totalPages,
    sort,
    scope: queryParts.normalizedScope,
    topSharedEmails,
  };
}

export function listAllOverlapRows({
  filter,
  sort,
  scope,
}: {
  filter: OverlapFilter;
  sort: OverlapSort;
  scope?: Partial<OverlapScope>;
}) {
  const queryParts = buildOverlapQueryParts(scope);
  return queryRows<OverlapRow>(
    `
      ${queryParts.cte}
      SELECT
        email,
        "recordCount",
        "userCount",
        "subscribedCount",
        "unsubscribedCount",
        "bouncedCount"
      FROM shared_emails
      WHERE ${queryParts.scopeWhereSql}
      ${overlapCondition(filter).replace('WHERE', 'AND')}
      ORDER BY ${overlapOrderBy(sort)}
    `,
    queryParts.params,
  ).map((row) => ({
    email: row.email,
    userCount: Number(row.userCount || 0),
    recordCount: Number(row.recordCount || 0),
    subscribedCount: Number(row.subscribedCount || 0),
    unsubscribedCount: Number(row.unsubscribedCount || 0),
    bouncedCount: Number(row.bouncedCount || 0),
  }));
}
