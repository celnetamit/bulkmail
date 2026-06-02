import { requireAdminFromCookies } from '@/lib/auth';
import { listRecentAuditEvents } from '@/lib/audit';
import { ok } from '@/lib/http';
import { buildSystemHealthAlerts, getSystemHealthSnapshot, listRecentSystemEvents } from '@/lib/observability';
import { startOfUtcDay } from '@/lib/quota';
import { recordResourceMetric } from '@/lib/resource-analytics';
import { queryRows, queryRow } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireAdminFromCookies();
  if ('error' in auth) return auth.error;

  const from = startOfUtcDay();

  let live = null;
  try {
    live = recordResourceMetric({
      scopeType: 'GLOBAL',
      eventType: 'PAGE_VIEW',
      userId: auth.user.userId,
      note: 'admin_overview',
    });
  } catch (error) {
    console.error('admin_overview_metric_failed', {
      userId: auth.user.userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  let users = [] as Array<{
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
  }>;
  let campaigns = 0;
  let lists = 0;
  let contacts = 0;
  let suppressedContacts = 0;
  let usersWithStats: Array<Record<string, unknown>> = [];
  let sentTodayTotal = 0;
  let openTotal = 0;
  let bounceTotal = 0;
  let unsubscribeTotal = 0;

  try {
    users = queryRows<{
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

    campaigns = queryRow<{ count: number }>('SELECT COUNT(*) as count FROM "Campaign"')?.count || 0;
    lists = queryRow<{ count: number }>('SELECT COUNT(*) as count FROM "List"')?.count || 0;
    contacts = queryRow<{ count: number }>('SELECT COUNT(*) as count FROM "Contact"')?.count || 0;
    suppressedContacts = queryRow<{ count: number }>(
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

    usersWithStats = users.map((user) => {
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

    sentTodayTotal = sentTodayRows.reduce((sum, row) => sum + row.count, 0);
    openTotal = eventRows.filter((row) => row.type === 'OPENED').reduce((sum, row) => sum + row.count, 0);
    bounceTotal = eventRows.filter((row) => row.type === 'BOUNCED').reduce((sum, row) => sum + row.count, 0);
    unsubscribeTotal = eventRows.filter((row) => row.type === 'UNSUBSCRIBED').reduce((sum, row) => sum + row.count, 0);
  } catch (error) {
    console.error('admin_overview_query_failed', {
      userId: auth.user.userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const recentAudits = (() => {
    try {
      return listRecentAuditEvents(10).map((entry) => ({
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
    } catch (error) {
      console.error('admin_overview_audit_failed', {
        userId: auth.user.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  })();
  const recentSystemEvents = (() => {
    try {
      return listRecentSystemEvents(8).map((entry) => ({
        ...entry,
        details: (() => {
          if (!entry.details) return null;
          try {
            return JSON.parse(entry.details) as Record<string, unknown>;
          } catch {
            return null;
          }
        })(),
      }));
    } catch (error) {
      console.error('admin_overview_system_events_failed', {
        userId: auth.user.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  })();

  const systemHealth = (() => {
    try {
      return {
        ...getSystemHealthSnapshot(),
        live,
      };
    } catch (error) {
      console.error('admin_overview_system_health_failed', {
        userId: auth.user.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        uptimeSeconds: 0,
        queue: { queued: 0, running: 0, retrying: 0, failed: 0, skipped: 0 },
        recentErrors24h: 0,
        recentWarnings24h: 0,
        lastError: null,
        live,
      };
    }
  })();

  return ok({
    viewer: {
      userId: auth.user.userId,
      email: auth.user.email,
      role: auth.user.role,
    },
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
    systemHealth,
    systemAlerts: buildSystemHealthAlerts(systemHealth),
    users: usersWithStats,
    recentAudits,
    recentSystemEvents,
  });
}
