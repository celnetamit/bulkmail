import { NextResponse } from 'next/server';
import { requireUserFromCookies } from '@/lib/auth';
import { ok } from '@/lib/http';
import { buildOwnerScope } from '@/lib/data-scope';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SUMMARY_CACHE_TTL_MS = 15_000;
const SUMMARY_CACHE_MAX_ENTRIES = 100;

type AnalyticsSummaryPayload = {
  metrics: unknown;
  campaigns: Array<{ id: string; name: string; listId: string; ownerEmail: string; ownerName: string | null; ownerRole: string }>;
  lists: Array<{ id: string; name: string; ownerEmail: string; ownerName: string | null; ownerRole: string }>;
  scope: string;
};

type SummaryCacheEntry = {
  expiresAt: number;
  value: AnalyticsSummaryPayload;
};

type SummaryCacheStats = {
  hits: number;
  misses: number;
};

const globalAnalyticsSummaryCache = globalThis as typeof globalThis & {
  __mailflowAnalyticsSummaryCache?: Map<string, SummaryCacheEntry>;
  __mailflowAnalyticsSummaryCacheStats?: SummaryCacheStats;
};

const summaryCache =
  globalAnalyticsSummaryCache.__mailflowAnalyticsSummaryCache ||
  (globalAnalyticsSummaryCache.__mailflowAnalyticsSummaryCache = new Map<string, SummaryCacheEntry>());

const summaryCacheStats =
  globalAnalyticsSummaryCache.__mailflowAnalyticsSummaryCacheStats ||
  (globalAnalyticsSummaryCache.__mailflowAnalyticsSummaryCacheStats = {
    hits: 0,
    misses: 0,
  });

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildCacheKey(input: {
  userId: string;
  role: string;
  campaignId?: string;
  listId?: string;
  from: Date | null;
  to: Date | null;
}) {
  return JSON.stringify([
    input.userId,
    input.role,
    input.campaignId || '',
    input.listId || '',
    input.from?.toISOString() || '',
    input.to?.toISOString() || '',
  ]);
}

function readCachedSummary(cacheKey: string) {
  const entry = summaryCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    summaryCache.delete(cacheKey);
    return null;
  }
  return entry;
}

function writeCachedSummary(cacheKey: string, value: AnalyticsSummaryPayload) {
  const now = Date.now();

  summaryCache.forEach((entry, key) => {
    if (entry.expiresAt <= now) summaryCache.delete(key);
  });

  summaryCache.set(cacheKey, {
    expiresAt: now + SUMMARY_CACHE_TTL_MS,
    value,
  });

  if (summaryCache.size <= SUMMARY_CACHE_MAX_ENTRIES) return;
  const oldestKey = summaryCache.keys().next().value;
  if (oldestKey) summaryCache.delete(oldestKey);
}

function jsonWithCacheHeaders(
  payload: AnalyticsSummaryPayload,
  cacheStatus: 'HIT' | 'MISS',
  expiresAt: number,
) {
  const ttlRemainingMs = Math.max(0, expiresAt - Date.now());

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      'x-analytics-summary-cache': cacheStatus,
      'x-analytics-summary-cache-ttl-ms': String(ttlRemainingMs),
      'x-analytics-summary-cache-entries': String(summaryCache.size),
      'x-analytics-summary-cache-hits': String(summaryCacheStats.hits),
      'x-analytics-summary-cache-misses': String(summaryCacheStats.misses),
    },
  });
}

export async function GET(request: Request) {
  try {
    const auth = await requireUserFromCookies();
    if ('error' in auth) return auth.error;

    const { getUserAnalyticsSummary } = await import('@/lib/analytics');
    const { recordResourceMetric } = await import('@/lib/resource-analytics');
    const { queryRows } = await import('@/lib/sqlite');

    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId')?.trim() || undefined;
    const listId = searchParams.get('listId')?.trim() || undefined;
    const from = parseDate(searchParams.get('from'));
    const to = parseDate(searchParams.get('to'));
    const campaignScope = buildOwnerScope(auth.user, 'c."userId"');
    const listScope = buildOwnerScope(auth.user, 'l."userId"');
    const cacheKey = buildCacheKey({
      userId: auth.user.userId,
      role: auth.user.role,
      campaignId,
      listId,
      from,
      to,
    });

    recordResourceMetric({
      scopeType: 'GLOBAL',
      eventType: 'PAGE_VIEW',
      userId: auth.user.userId,
      note: 'analytics_summary',
    });

    const cached = readCachedSummary(cacheKey);
    if (cached) {
      summaryCacheStats.hits += 1;
      return jsonWithCacheHeaders(cached.value, 'HIT', cached.expiresAt);
    }

    summaryCacheStats.misses += 1;

    const [metrics, campaigns, lists] = await Promise.all([
      getUserAnalyticsSummary(auth.user.userId, { campaignId, listId, from, to, role: auth.user.role }),
      queryRows<{ id: string; name: string; listId: string; ownerEmail: string; ownerName: string | null; ownerRole: string }>(
        `
          SELECT c.id, c.name, c."listId", u.email as ownerEmail, u.name as ownerName, u.role as ownerRole
          FROM "Campaign" c
          INNER JOIN "User" u ON u.id = c."userId"
          WHERE ${campaignScope.clause}
          ORDER BY c."createdAt" DESC
        `,
        campaignScope.params,
      ),
      queryRows<{ id: string; name: string; ownerEmail: string; ownerName: string | null; ownerRole: string }>(
        `
          SELECT l.id, l.name, u.email as ownerEmail, u.name as ownerName, u.role as ownerRole
          FROM "List" l
          INNER JOIN "User" u ON u.id = l."userId"
          WHERE ${listScope.clause}
          ORDER BY l."createdAt" DESC
        `,
        listScope.params,
      ),
    ]);

    const payload = { metrics, campaigns, lists, scope: campaignScope.scope };
    writeCachedSummary(cacheKey, payload);

    return jsonWithCacheHeaders(payload, 'MISS', Date.now() + SUMMARY_CACHE_TTL_MS);
  } catch (error) {
    console.error('analytics_summary_failed', error);
    return ok({ error: 'Failed to load analytics.' }, 500);
  }
}
