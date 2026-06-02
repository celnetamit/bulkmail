import { requireAdminFromCookies } from '@/lib/auth';
import { listRecentAuditEvents } from '@/lib/audit';
import { ok } from '@/lib/http';
import { startOfUtcDay } from '@/lib/quota';
import { recordResourceMetric } from '@/lib/resource-analytics';
import { queryRows, queryRow } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireAdminFromCookies();
  if ('error' in auth) return auth.error;

  const from = startOfUtcDay();

  recordResourceMetric({
    scopeType: 'GLOBAL',
    eventType: 'PAGE_VIEW',
    userId: auth.user.userId,
    note: 'admin_overview',
  });

  const users = queryRows<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    isActive: number | boolean;
    dailyEmailLimit: number;
    imageUploadLimitKb: number | null;
    lastLoginAt: string | null;
    createdAt: string;
    listsCount: number;
    templatesCount: number;
    campaignsCount: number;
  }>(
    `
      SELECT
        u.id,
        u.email,
        u.name,
        u.role,
        u.isActive,
        u.dailyEmailLimit,
        u.imageUploadLimitKb,
        u.lastLoginAt,
        u.createdAt,
        (SELECT COUNT(*) FROM "List" l WHERE l.userId = u.id) as listsCount,
        (SELECT COUNT(*) FROM "Template" t WHERE t.userId = u.id) as templatesCount,
        (SELECT COUNT(*) FROM "Campaign" c WHERE c.userId = u.id) as campaignsCount
      FROM "User" u
      ORDER BY u.createdAt DESC
    `,
  );

  const campaigns = queryRow<{ count: number }>('SELECT COUNT(*) as count FROM "Campaign"')?.count || 0;
  const lists = queryRow<{ count: number }>('SELECT COUNT(*) as count FROM "List"')?.count || 0;
  const contacts = queryRow<{ count: number }>('SELECT COUNT(*) as count FROM "Contact"')?.count || 0;
  const suppressedContacts = queryRow<{ count: number }>(
    `
      SELECT COUNT(*) as count
      FROM "Contact"
      WHERE status IN ('UNSUBSCRIBED', 'BOUNCED')
    `,
  )?.count || 0;
  const contactRows = queryRows<{ userId: string; count: number }>(
    `
      SELECT l.userId as userId, COUNT(*) as count
      FROM "Contact" c
      INNER JOIN "List" l ON l.id = c.listId
      GROUP BY l.userId
    `,
  );
  const sentTodayRows = queryRows<{ userId: string; count: number }>(
    `
      SELECT c.userId as userId, COUNT(*) as count
      FROM "Event" e
      INNER JOIN "Campaign" c ON c.id = e.campaignId
      WHERE e.type = 'SENT' AND e.createdAt >= ?
      GROUP BY c.userId
    `,
    [from.toISOString()],
  );
  const eventRows = queryRows<{ userId: string; type: string; count: number }>(
    `
      SELECT c.userId as userId, e.type as type, COUNT(*) as count
      FROM "Event" e
      INNER JOIN "Campaign" c ON c.id = e.campaignId
      GROUP BY c.userId, e.type
    `,
  );

  const sentTodayByUser = new Map<string, number>(sentTodayRows.map((row) => [row.userId, row.count]));
  const contactByUser = new Map<string, number>(contactRows.map((row) => [row.userId, row.count]));
  const eventByUser = new Map<string, Record<string, number>>();

  for (const row of eventRows as Array<{ userId: string; type: string; count: number }>) {
    if (!eventByUser.has(row.userId)) eventByUser.set(row.userId, {});
    eventByUser.get(row.userId)![row.type] = row.count;
  }

  const usersWithStats = users.map((user) => {
    const events = eventByUser.get(user.id) || {};
    const sentToday = sentTodayByUser.get(user.id) || 0;
    const contactCount = contactByUser.get(user.id) || 0;
    const sentTotal = events.SENT || 0;
    const delivered = events.DELIVERED || 0;
    const opened = events.OPENED || 0;
    const bounced = events.BOUNCED || 0;
    const unsubscribed = events.UNSUBSCRIBED || 0;
    const remainingToday = Math.max(0, user.dailyEmailLimit - sentToday);

    return {
      ...user,
      isActive: Boolean(user.isActive),
      sentToday,
      contactCount,
      remainingToday,
      imageUploadLimitKb: user.imageUploadLimitKb ?? null,
      sentTotal,
      opened,
      delivered,
      bounced,
      unsubscribed,
      openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
      bounceRate: sentTotal > 0 ? (bounced / sentTotal) * 100 : 0,
      unsubscribeRate: delivered > 0 ? (unsubscribed / delivered) * 100 : 0,
    };
  });

  const sentTodayTotal = sentTodayRows.reduce((sum, row) => sum + row.count, 0);
  const openTotal = eventRows.filter((row) => row.type === 'OPENED').reduce((sum, row) => sum + row.count, 0);
  const bounceTotal = eventRows.filter((row) => row.type === 'BOUNCED').reduce((sum, row) => sum + row.count, 0);
  const unsubscribeTotal = eventRows.filter((row) => row.type === 'UNSUBSCRIBED').reduce((sum, row) => sum + row.count, 0);
  const recentAudits = listRecentAuditEvents(10).map((entry) => ({
    ...entry,
    metadata: (() => {
      if (!entry.metadataJson) return null;
      try {
        return JSON.parse(entry.metadataJson) as Record<string, unknown>;
      } catch {
        return null;
      }
    })(),
  }));

  return ok({
    totals: {
      users: users.length,
      activeUsers: users.filter((user) => Boolean(user.isActive)).length,
      campaigns,
      lists,
      contacts,
      suppressedContacts,
      sentToday: sentTodayTotal,
      openTotal,
      bounceTotal,
      unsubscribeTotal,
    },
    users: usersWithStats,
    recentAudits,
  });
}
