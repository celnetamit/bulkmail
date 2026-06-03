import { requireUserFromCookies } from '@/lib/auth';
import { ok } from '@/lib/http';
import { buildOwnerScope } from '@/lib/data-scope';

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
    const campaignScope = buildOwnerScope(auth.user, 'c.userId');
    const listScope = buildOwnerScope(auth.user, 'l.userId');

    recordResourceMetric({
      scopeType: 'GLOBAL',
      eventType: 'PAGE_VIEW',
      userId: auth.user.userId,
      note: 'analytics_summary',
    });

    const [metrics, campaigns, lists] = await Promise.all([
      getUserAnalyticsSummary(auth.user.userId, { campaignId, listId, from, to, role: auth.user.role }),
      queryRows<{ id: string; name: string; listId: string; ownerEmail: string; ownerName: string | null; ownerRole: string }>(
        `
          SELECT c.id, c.name, c.listId, u.email as ownerEmail, u.name as ownerName, u.role as ownerRole
          FROM "Campaign" c
          INNER JOIN "User" u ON u.id = c.userId
          WHERE ${campaignScope.clause}
          ORDER BY c.createdAt DESC
        `,
        campaignScope.params,
      ),
      queryRows<{ id: string; name: string; ownerEmail: string; ownerName: string | null; ownerRole: string }>(
        `
          SELECT l.id, l.name, u.email as ownerEmail, u.name as ownerName, u.role as ownerRole
          FROM "List" l
          INNER JOIN "User" u ON u.id = l.userId
          WHERE ${listScope.clause}
          ORDER BY l.createdAt DESC
        `,
        listScope.params,
      ),
    ]);

    return ok({ metrics, campaigns, lists, scope: campaignScope.scope });
  } catch (error) {
    console.error('analytics_summary_failed', error);
    return ok({ error: 'Failed to load analytics.' }, 500);
  }
}
