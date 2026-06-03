import os from 'node:os';
import { performance } from 'node:perf_hooks';

import { queryRow, queryRows, executeSql } from '@/lib/sqlite';

type Role = 'ADMIN' | 'MANAGER' | 'USER';

export type ResourceScopeType = 'GLOBAL' | 'USER' | 'CAMPAIGN';
export type ResourceEventType = 'PAGE_VIEW' | 'SNAPSHOT' | 'SEND_START' | 'SEND_PROGRESS' | 'SEND_COMPLETE';

export type ResourceSnapshot = {
  cpuUserMs: number;
  cpuSystemMs: number;
  memoryRssMb: number;
  memoryHeapUsedMb: number;
  memoryHeapTotalMb: number;
  eventLoopUtilization: number;
  activeHandles: number;
  activeRequests: number;
  loadAverage1m: number;
  loadAverage5m: number;
  loadAverage15m: number;
};

export type ResourceMetricInput = {
  scopeType: ResourceScopeType;
  eventType: ResourceEventType;
  userId?: string | null;
  campaignId?: string | null;
  sentCount?: number;
  failedCount?: number;
  skippedCount?: number;
  recipientCount?: number;
  durationMs?: number | null;
  note?: string | null;
};

export type ResourceTrendPoint = {
  day: string;
  samples: number;
  sentCount: number;
  failedCount: number;
  avgRssMb: number;
  peakRssMb: number;
  avgHeapUsedMb: number;
  peakHeapUsedMb: number;
  avgEventLoopUtilization: number;
};

export type ResourceUserRow = {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  campaigns: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  avgRssMb: number;
  peakRssMb: number;
  avgHeapUsedMb: number;
  avgDurationMs: number;
  lastSeenAt: string | null;
};

export type ResourceTeamRow = {
  teamId: string;
  name: string;
  description: string | null;
  managerEmail: string;
  memberCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  avgRssMb: number;
  peakRssMb: number;
  avgHeapUsedMb: number;
  avgDurationMs: number;
};

export type ResourceCampaignRow = {
  campaignId: string;
  name: string;
  subject: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  durationSeconds: number | null;
  peakRssMb: number;
  peakHeapUsedMb: number;
  avgRssMb: number;
  avgHeapUsedMb: number;
  avgEventLoopUtilization: number;
  emailsPerSecond: number;
  sentAt: string | null;
};

export type DeliverabilityTrendPoint = {
  day: string;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  bouncedCount: number;
  unsubscribedCount: number;
};

export type DeliverabilitySummary = {
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  bouncedCount: number;
  unsubscribedCount: number;
  deliveryRate: number;
  openRate: number;
  bounceRate: number;
  unsubscribeRate: number;
};

export type ResourceAnalyticsSummary = {
  scope: 'GLOBAL' | 'TEAM' | 'SELF';
  live: ResourceSnapshot;
  totals: {
    samples: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    campaigns: number;
    users: number;
    teams: number;
    avgRssMb: number;
    peakRssMb: number;
    avgHeapUsedMb: number;
    peakHeapUsedMb: number;
    avgEventLoopUtilization: number;
    peakEventLoopUtilization: number;
    avgDurationMs: number;
    peakDurationMs: number;
    totalRecipients: number;
    throughputPerSecond: number;
    peakDay: string | null;
    peakDaySentCount: number;
  };
  dailyPeaks: ResourceTrendPoint[];
  userBreakdown: ResourceUserRow[];
  teamBreakdown: ResourceTeamRow[];
  campaignCorrelation: ResourceCampaignRow[];
  deliverabilitySummary: DeliverabilitySummary;
  deliverabilityTrend: DeliverabilityTrendPoint[];
};

let lastEventLoopSample = performance.eventLoopUtilization();

function currentEventLoopUtilization() {
  const utilization = performance.eventLoopUtilization(lastEventLoopSample);
  lastEventLoopSample = performance.eventLoopUtilization();
  return utilization.utilization || 0;
}

export function captureResourceSnapshot(): ResourceSnapshot {
  const memory = process.memoryUsage();
  const resourceUsage = process.resourceUsage();
  const processInternals = process as unknown as {
    _getActiveHandles?: () => unknown[];
    _getActiveRequests?: () => unknown[];
  };
  const activeHandles = typeof processInternals._getActiveHandles === 'function'
    ? processInternals._getActiveHandles().length
    : 0;
  const activeRequests = typeof processInternals._getActiveRequests === 'function'
    ? processInternals._getActiveRequests().length
    : 0;

  return {
    cpuUserMs: resourceUsage.userCPUTime / 1000,
    cpuSystemMs: resourceUsage.systemCPUTime / 1000,
    memoryRssMb: memory.rss / 1024 / 1024,
    memoryHeapUsedMb: memory.heapUsed / 1024 / 1024,
    memoryHeapTotalMb: memory.heapTotal / 1024 / 1024,
    eventLoopUtilization: currentEventLoopUtilization(),
    activeHandles,
    activeRequests,
    loadAverage1m: os.loadavg()[0] || 0,
    loadAverage5m: os.loadavg()[1] || 0,
    loadAverage15m: os.loadavg()[2] || 0,
  };
}

export function recordResourceMetric(input: ResourceMetricInput) {
  const snapshot = captureResourceSnapshot();
  executeSql(
    `
      INSERT INTO "ResourceMetric" (
        id, "scopeType", "eventType", "userId", "campaignId",
        "cpuUserMs", "cpuSystemMs", "memoryRssMb", "memoryHeapUsedMb", "memoryHeapTotalMb",
        "eventLoopUtilization", "activeHandles", "activeRequests",
        "loadAverage1m", "loadAverage5m", "loadAverage15m",
        "sentCount", "failedCount", "skippedCount", "recipientCount",
        "durationMs", note, "createdAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      crypto.randomUUID().replace(/-/g, ''),
      input.scopeType,
      input.eventType,
      input.userId || null,
      input.campaignId || null,
      snapshot.cpuUserMs,
      snapshot.cpuSystemMs,
      snapshot.memoryRssMb,
      snapshot.memoryHeapUsedMb,
      snapshot.memoryHeapTotalMb,
      snapshot.eventLoopUtilization,
      snapshot.activeHandles,
      snapshot.activeRequests,
      snapshot.loadAverage1m,
      snapshot.loadAverage5m,
      snapshot.loadAverage15m,
      input.sentCount ?? 0,
      input.failedCount ?? 0,
      input.skippedCount ?? 0,
      input.recipientCount ?? 0,
      input.durationMs ?? null,
      input.note || null,
      new Date().toISOString(),
    ],
  );

  return snapshot;
}

function buildAccessibleUserFilter(role: Role, userId: string) {
  if (role === 'ADMIN') {
    return { clause: '1=1', params: [] as unknown[] };
  }

  if (role === 'MANAGER') {
    const managedUsers = queryRows<{ userId: string }>(
      `
        SELECT DISTINCT tm."userId" as "userId"
        FROM "Team" t
        INNER JOIN "TeamMember" tm ON tm."teamId" = t.id
        WHERE t."managerId" = ?
      `,
      [userId],
    ).map((row) => row.userId);

    const uniqueUserIds = Array.from(new Set([userId, ...managedUsers]));
    return {
      clause: uniqueUserIds.length ? `rm."userId" IN (${uniqueUserIds.map(() => '?').join(', ')})` : '1=0',
      params: uniqueUserIds,
    };
  }

  return { clause: 'rm."userId" = ?', params: [userId] };
}

function buildCampaignUserFilter(role: Role, userId: string) {
  if (role === 'ADMIN') {
    return { clause: '1=1', params: [] as unknown[] };
  }

  if (role === 'MANAGER') {
    const managedUsers = queryRows<{ userId: string }>(
      `
        SELECT DISTINCT tm."userId" as "userId"
        FROM "Team" t
        INNER JOIN "TeamMember" tm ON tm."teamId" = t.id
        WHERE t."managerId" = ?
      `,
      [userId],
    ).map((row) => row.userId);

    const uniqueUserIds = Array.from(new Set([userId, ...managedUsers]));
    return {
      clause: uniqueUserIds.length ? `c."userId" IN (${uniqueUserIds.map(() => '?').join(', ')})` : '1=0',
      params: uniqueUserIds,
    };
  }

  return { clause: 'c."userId" = ?', params: [userId] };
}

export async function getResourceAnalyticsSummary(userId: string, role: Role, from: Date, to: Date | null) {
  const accessibleUserFilter = buildAccessibleUserFilter(role, userId);
  const accessibleCampaignFilter = buildCampaignUserFilter(role, userId);
  const dateParams = [from.toISOString(), ...(to ? [to.toISOString()] : [])];
  const dateClause = to ? 'rm."createdAt" BETWEEN ? AND ?' : 'rm."createdAt" >= ?';

  const live = captureResourceSnapshot();
  const totalsParams = [
    ...accessibleUserFilter.params,
    ...dateParams,
    ...accessibleUserFilter.params,
    ...dateParams,
    ...accessibleUserFilter.params,
    ...dateParams,
  ];

  const totals = queryRow<{
    samples: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    campaigns: number;
    users: number;
    teams: number;
    avgRssMb: number;
    peakRssMb: number;
    avgHeapUsedMb: number;
    peakHeapUsedMb: number;
    avgEventLoopUtilization: number;
    peakEventLoopUtilization: number;
    avgDurationMs: number;
    peakDurationMs: number;
    totalRecipients: number;
    throughputPerSecond: number;
    peakDay: string | null;
    peakDaySentCount: number;
  }>(
    `
      SELECT
        COUNT(*) as samples,
           COALESCE(COUNT(DISTINCT CASE WHEN rm."eventType" = 'SEND_COMPLETE' THEN rm."campaignId" END), 0) as campaigns,
           COALESCE(COUNT(DISTINCT rm."userId"), 0) as users,
        COALESCE(SUM(CASE WHEN "eventType" = 'SEND_COMPLETE' THEN "sentCount" ELSE 0 END), 0) as "sentCount",
        COALESCE(SUM(CASE WHEN "eventType" = 'SEND_COMPLETE' THEN "failedCount" ELSE 0 END), 0) as "failedCount",
        COALESCE(SUM(CASE WHEN "eventType" = 'SEND_COMPLETE' THEN "skippedCount" ELSE 0 END), 0) as "skippedCount",
        COALESCE(AVG("memoryRssMb"), 0) as avgRssMb,
        COALESCE(MAX("memoryRssMb"), 0) as peakRssMb,
        COALESCE(AVG("memoryHeapUsedMb"), 0) as avgHeapUsedMb,
        COALESCE(MAX("memoryHeapUsedMb"), 0) as peakHeapUsedMb,
        COALESCE(AVG("eventLoopUtilization"), 0) as avgEventLoopUtilization,
        COALESCE(MAX("eventLoopUtilization"), 0) as peakEventLoopUtilization,
        COALESCE(AVG("durationMs"), 0) as avgDurationMs,
        COALESCE(MAX("durationMs"), 0) as peakDurationMs,
        COALESCE(SUM("recipientCount"), 0) as "totalRecipients",
        CASE
          WHEN COALESCE(SUM(CASE WHEN "eventType" = 'SEND_COMPLETE' THEN "durationMs" ELSE 0 END), 0) > 0
            THEN COALESCE(SUM(CASE WHEN "eventType" = 'SEND_COMPLETE' THEN "sentCount" ELSE 0 END), 0) * 1000.0
                 / NULLIF(SUM(CASE WHEN "eventType" = 'SEND_COMPLETE' THEN "durationMs" ELSE 0 END), 0)
          ELSE 0
        END as throughputPerSecond,
        (
          SELECT day
          FROM (
            SELECT date(rm."createdAt") as day, SUM(CASE WHEN rm."eventType" = 'SEND_COMPLETE' THEN rm."sentCount" ELSE 0 END) as sentTotal
            FROM "ResourceMetric" rm
            WHERE ${accessibleUserFilter.clause}
            AND ${dateClause}
            GROUP BY date(rm."createdAt")
            ORDER BY sentTotal DESC, day DESC
            LIMIT 1
          )
        ) as peakDay,
        COALESCE((
          SELECT sentTotal
          FROM (
            SELECT date(rm."createdAt") as day, SUM(CASE WHEN rm."eventType" = 'SEND_COMPLETE' THEN rm."sentCount" ELSE 0 END) as sentTotal
            FROM "ResourceMetric" rm
            WHERE ${accessibleUserFilter.clause}
            AND ${dateClause}
            GROUP BY date(rm."createdAt")
            ORDER BY sentTotal DESC, day DESC
            LIMIT 1
          )
        ), 0) as peakDaySentCount
      FROM "ResourceMetric" rm
      WHERE ${accessibleUserFilter.clause}
      AND ${dateClause}
    `,
    totalsParams,
  );

  const dailyPeaks = queryRows<ResourceTrendPoint>(
    `
      SELECT
        date(rm."createdAt") as day,
        COUNT(*) as samples,
        COALESCE(SUM(CASE WHEN rm."eventType" = 'SEND_COMPLETE' THEN rm."sentCount" ELSE 0 END), 0) as "sentCount",
        COALESCE(SUM(CASE WHEN rm."eventType" = 'SEND_COMPLETE' THEN rm."failedCount" ELSE 0 END), 0) as "failedCount",
        COALESCE(AVG(rm."memoryRssMb"), 0) as avgRssMb,
        COALESCE(MAX(rm."memoryRssMb"), 0) as peakRssMb,
        COALESCE(AVG(rm."memoryHeapUsedMb"), 0) as avgHeapUsedMb,
        COALESCE(MAX(rm."memoryHeapUsedMb"), 0) as peakHeapUsedMb,
        COALESCE(AVG(rm."eventLoopUtilization"), 0) as avgEventLoopUtilization
      FROM "ResourceMetric" rm
      WHERE ${accessibleUserFilter.clause}
      AND ${dateClause}
      GROUP BY date(rm."createdAt")
      ORDER BY day ASC
    `,
    [...accessibleUserFilter.params, ...dateParams],
  );

  const userBreakdown = queryRows<ResourceUserRow>(
    `
      SELECT
        u.id as "userId",
        u.email,
        u.name,
        u.role,
        COUNT(DISTINCT CASE WHEN rm."eventType" = 'SEND_COMPLETE' THEN rm."campaignId" END) as campaigns,
        COALESCE(SUM(CASE WHEN rm."eventType" = 'SEND_COMPLETE' THEN rm."sentCount" ELSE 0 END), 0) as "sentCount",
        COALESCE(SUM(CASE WHEN rm."eventType" = 'SEND_COMPLETE' THEN rm."failedCount" ELSE 0 END), 0) as "failedCount",
        COALESCE(SUM(CASE WHEN rm."eventType" = 'SEND_COMPLETE' THEN rm."skippedCount" ELSE 0 END), 0) as "skippedCount",
        COALESCE(AVG(rm."memoryRssMb"), 0) as avgRssMb,
        COALESCE(MAX(rm."memoryRssMb"), 0) as peakRssMb,
        COALESCE(AVG(rm."memoryHeapUsedMb"), 0) as avgHeapUsedMb,
        COALESCE(AVG(rm."durationMs"), 0) as avgDurationMs,
        MAX(rm."createdAt") as lastSeenAt
      FROM "ResourceMetric" rm
      INNER JOIN "User" u ON u.id = rm."userId"
      WHERE ${accessibleUserFilter.clause}
      AND ${dateClause}
      GROUP BY u.id, u.email, u.name, u.role
      ORDER BY "sentCount" DESC, peakRssMb DESC, u.email ASC
    `,
    [...accessibleUserFilter.params, ...dateParams],
  );

  const teamBreakdown = queryRows<ResourceTeamRow>(
    `
      SELECT
        t.id as "teamId",
        t.name,
        t.description,
        m.email as managerEmail,
        COUNT(DISTINCT tm."userId") as memberCount,
        COALESCE(SUM(CASE WHEN rm."eventType" = 'SEND_COMPLETE' THEN rm."sentCount" ELSE 0 END), 0) as "sentCount",
        COALESCE(SUM(CASE WHEN rm."eventType" = 'SEND_COMPLETE' THEN rm."failedCount" ELSE 0 END), 0) as "failedCount",
        COALESCE(SUM(CASE WHEN rm."eventType" = 'SEND_COMPLETE' THEN rm."skippedCount" ELSE 0 END), 0) as "skippedCount",
        COALESCE(AVG(rm."memoryRssMb"), 0) as avgRssMb,
        COALESCE(MAX(rm."memoryRssMb"), 0) as peakRssMb,
        COALESCE(AVG(rm."memoryHeapUsedMb"), 0) as avgHeapUsedMb,
        COALESCE(AVG(rm."durationMs"), 0) as avgDurationMs
      FROM "Team" t
      INNER JOIN "User" m ON m.id = t."managerId"
      LEFT JOIN "TeamMember" tm ON tm."teamId" = t.id
      LEFT JOIN "ResourceMetric" rm ON rm."userId" = tm."userId" AND ${dateClause}
      WHERE ${role === 'MANAGER' ? 't.managerId = ?' : '1=1'}
      GROUP BY t.id, t.name, t.description, m.email
      ORDER BY "sentCount" DESC, peakRssMb DESC, t.name ASC
    `,
    [
      ...dateParams,
      ...(role === 'MANAGER' ? [userId] : []),
    ],
  );

  const campaignCorrelation = queryRows<ResourceCampaignRow>(
    `
      SELECT
        c.id as "campaignId",
        c.name,
        c.subject,
        c.status,
        c."totalRecipients",
        c."sentCount",
        c."failedCount",
        c."skippedCount",
        c."durationSeconds",
        COALESCE(MAX(rm."memoryRssMb"), 0) as peakRssMb,
        COALESCE(MAX(rm."memoryHeapUsedMb"), 0) as peakHeapUsedMb,
        COALESCE(AVG(rm."memoryRssMb"), 0) as avgRssMb,
        COALESCE(AVG(rm."memoryHeapUsedMb"), 0) as avgHeapUsedMb,
        COALESCE(AVG(rm."eventLoopUtilization"), 0) as avgEventLoopUtilization,
        CASE
          WHEN COALESCE(MAX(rm."durationMs"), 0) > 0
            THEN COALESCE(MAX(rm."sentCount"), 0) * 1000.0 / NULLIF(MAX(rm."durationMs"), 0)
          ELSE 0
        END as emailsPerSecond,
        MAX(rm."createdAt") as sentAt
      FROM "Campaign" c
      LEFT JOIN "ResourceMetric" rm ON rm."campaignId" = c.id AND rm."eventType" = 'SEND_COMPLETE'
      WHERE ${accessibleCampaignFilter.clause}
      AND c."createdAt" >= ?
      GROUP BY c.id, c.name, c.subject, c.status, c."totalRecipients", c."sentCount", c."failedCount", c."skippedCount", c."durationSeconds"
      ORDER BY sentAt DESC, c."createdAt" DESC
      LIMIT 30
    `,
    [...accessibleCampaignFilter.params, from.toISOString()],
  );

  const eventDateClause = to ? 'e."createdAt" BETWEEN ? AND ?' : 'e."createdAt" >= ?';
  const eventDateParams = [from.toISOString(), ...(to ? [to.toISOString()] : [])];
  const deliverabilitySummary = queryRow<DeliverabilitySummary>(
    `
      SELECT
        COALESCE(SUM(CASE WHEN e.type = 'SENT' THEN 1 ELSE 0 END), 0) as "sentCount",
        COALESCE(SUM(CASE WHEN e.type = 'DELIVERED' THEN 1 ELSE 0 END), 0) as deliveredCount,
        COALESCE(SUM(CASE WHEN e.type = 'OPENED' THEN 1 ELSE 0 END), 0) as openedCount,
        COALESCE(SUM(CASE WHEN e.type = 'BOUNCED' THEN 1 ELSE 0 END), 0) as bouncedCount,
        COALESCE(SUM(CASE WHEN e.type = 'UNSUBSCRIBED' THEN 1 ELSE 0 END), 0) as unsubscribedCount,
        CASE
          WHEN COALESCE(SUM(CASE WHEN e.type = 'SENT' THEN 1 ELSE 0 END), 0) > 0
            THEN COALESCE(SUM(CASE WHEN e.type = 'DELIVERED' THEN 1 ELSE 0 END), 0) * 100.0
                 / NULLIF(SUM(CASE WHEN e.type = 'SENT' THEN 1 ELSE 0 END), 0)
          ELSE 0
        END as deliveryRate,
        CASE
          WHEN COALESCE(SUM(CASE WHEN e.type = 'DELIVERED' THEN 1 ELSE 0 END), 0) > 0
            THEN COALESCE(SUM(CASE WHEN e.type = 'OPENED' THEN 1 ELSE 0 END), 0) * 100.0
                 / NULLIF(SUM(CASE WHEN e.type = 'DELIVERED' THEN 1 ELSE 0 END), 0)
          ELSE 0
        END as openRate,
        CASE
          WHEN COALESCE(SUM(CASE WHEN e.type = 'SENT' THEN 1 ELSE 0 END), 0) > 0
            THEN COALESCE(SUM(CASE WHEN e.type = 'BOUNCED' THEN 1 ELSE 0 END), 0) * 100.0
                 / NULLIF(SUM(CASE WHEN e.type = 'SENT' THEN 1 ELSE 0 END), 0)
          ELSE 0
        END as bounceRate,
        CASE
          WHEN COALESCE(SUM(CASE WHEN e.type = 'DELIVERED' THEN 1 ELSE 0 END), 0) > 0
            THEN COALESCE(SUM(CASE WHEN e.type = 'UNSUBSCRIBED' THEN 1 ELSE 0 END), 0) * 100.0
                 / NULLIF(SUM(CASE WHEN e.type = 'DELIVERED' THEN 1 ELSE 0 END), 0)
          ELSE 0
        END as unsubscribeRate
      FROM "Event" e
      INNER JOIN "Campaign" c ON c.id = e."campaignId"
      WHERE ${accessibleCampaignFilter.clause}
      AND ${eventDateClause}
    `,
    [...accessibleCampaignFilter.params, ...eventDateParams],
  );

  const deliverabilityTrend = queryRows<DeliverabilityTrendPoint>(
    `
      SELECT
        date(e."createdAt") as day,
        COALESCE(SUM(CASE WHEN e.type = 'SENT' THEN 1 ELSE 0 END), 0) as "sentCount",
        COALESCE(SUM(CASE WHEN e.type = 'DELIVERED' THEN 1 ELSE 0 END), 0) as deliveredCount,
        COALESCE(SUM(CASE WHEN e.type = 'OPENED' THEN 1 ELSE 0 END), 0) as openedCount,
        COALESCE(SUM(CASE WHEN e.type = 'BOUNCED' THEN 1 ELSE 0 END), 0) as bouncedCount,
        COALESCE(SUM(CASE WHEN e.type = 'UNSUBSCRIBED' THEN 1 ELSE 0 END), 0) as unsubscribedCount
      FROM "Event" e
      INNER JOIN "Campaign" c ON c.id = e."campaignId"
      WHERE ${accessibleCampaignFilter.clause}
      AND ${eventDateClause}
      GROUP BY date(e."createdAt")
      ORDER BY day ASC
    `,
    [...accessibleCampaignFilter.params, ...eventDateParams],
  );

  const totalTeams = queryRow<{ count: number }>(
    `SELECT COUNT(*) as count FROM "Team" t ${role === 'MANAGER' ? 'WHERE t.managerId = ?' : ''}`,
    role === 'MANAGER' ? [userId] : [],
  );

  return {
    scope: role === 'ADMIN' ? 'GLOBAL' : role === 'MANAGER' ? 'TEAM' : 'SELF',
    live,
    totals: {
      samples: totals?.samples || 0,
      sentCount: totals?.sentCount || 0,
      failedCount: totals?.failedCount || 0,
      skippedCount: totals?.skippedCount || 0,
      campaigns: totals?.campaigns || 0,
      users: totals?.users || 0,
      teams: totalTeams?.count || 0,
      avgRssMb: totals?.avgRssMb || 0,
      peakRssMb: totals?.peakRssMb || 0,
      avgHeapUsedMb: totals?.avgHeapUsedMb || 0,
      peakHeapUsedMb: totals?.peakHeapUsedMb || 0,
      avgEventLoopUtilization: totals?.avgEventLoopUtilization || 0,
      peakEventLoopUtilization: totals?.peakEventLoopUtilization || 0,
      avgDurationMs: totals?.avgDurationMs || 0,
      peakDurationMs: totals?.peakDurationMs || 0,
      totalRecipients: totals?.totalRecipients || 0,
      throughputPerSecond: totals?.throughputPerSecond || 0,
      peakDay: totals?.peakDay || null,
      peakDaySentCount: totals?.peakDaySentCount || 0,
    },
    dailyPeaks,
    userBreakdown,
    teamBreakdown,
    campaignCorrelation,
    deliverabilitySummary: deliverabilitySummary || {
      sentCount: 0,
      deliveredCount: 0,
      openedCount: 0,
      bouncedCount: 0,
      unsubscribedCount: 0,
      deliveryRate: 0,
      openRate: 0,
      bounceRate: 0,
      unsubscribeRate: 0,
    },
    deliverabilityTrend,
  } satisfies ResourceAnalyticsSummary;
}
