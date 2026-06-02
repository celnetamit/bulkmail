import { requireManagerOrAdminFromCookies } from '@/lib/auth';
import { ok } from '@/lib/http';
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

  const summary = await getResourceAnalyticsSummary(auth.user.userId, auth.user.role as 'ADMIN' | 'MANAGER' | 'USER', from, to);
  return ok(summary);
}
