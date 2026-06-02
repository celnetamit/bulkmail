import { requireManagerOrAdminFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { recordSystemEvent } from '@/lib/observability';
import { getResourceAnalyticsSummary, recordResourceMetric } from '@/lib/resource-analytics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function GET(request: Request) {
  const auth = await requireManagerOrAdminFromCookies();
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const to = parseDate(searchParams.get('to'));
  const from = parseDate(searchParams.get('from')) || startOfUtcDay(new Date(Date.now() - 13 * 24 * 60 * 60 * 1000));

  recordResourceMetric({
    scopeType: 'GLOBAL',
    eventType: 'PAGE_VIEW',
    userId: auth.user.userId,
    note: `resource_analytics:${auth.user.role}`,
  });

  try {
    const summary = await getResourceAnalyticsSummary(auth.user.userId, auth.user.role as 'ADMIN' | 'MANAGER' | 'USER', from, to);
    return ok(summary);
  } catch (error) {
    console.error('resource_analytics_summary_failed', {
      userId: auth.user.userId,
      role: auth.user.role,
      error: error instanceof Error ? error.message : String(error),
    });
    recordSystemEvent({
      level: 'ERROR',
      source: 'resource_analytics_summary',
      message: error instanceof Error ? error.message : 'Failed to load resource analytics.',
      userId: auth.user.userId,
      details: {
        route: '/api/resource-analytics/summary',
        role: auth.user.role,
      },
    });
    return fail(error instanceof Error ? error.message : 'Failed to load resource analytics.', 500);
  }
}
