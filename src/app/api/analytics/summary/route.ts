import { requireUserFromCookies } from '@/lib/auth';
import { ok } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

    recordResourceMetric({
      scopeType: 'GLOBAL',
      eventType: 'PAGE_VIEW',
      userId: auth.user.userId,
      note: 'analytics_summary',
    });

    const [metrics, campaigns, lists] = await Promise.all([
      getUserAnalyticsSummary(auth.user.userId, { campaignId, listId, from, to }),
      queryRows<{ id: string; name: string; listId: string }>(
        `
          SELECT id, name, listId
          FROM "Campaign"
          WHERE userId = ?
          ORDER BY createdAt DESC
        `,
        [auth.user.userId],
      ),
      queryRows<{ id: string; name: string }>(
        `
          SELECT id, name
          FROM "List"
          WHERE userId = ?
          ORDER BY createdAt DESC
        `,
        [auth.user.userId],
      ),
    ]);

    return ok({ metrics, campaigns, lists });
  } catch (error) {
    console.error('analytics_summary_failed', error);
    return ok({ error: 'Failed to load analytics.' }, 500);
  }
}
