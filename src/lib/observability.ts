import crypto from 'node:crypto';

import { captureResourceSnapshot, type ResourceSnapshot } from '@/lib/resource-analytics';
import { executeSql, queryRow, queryRows } from '@/lib/sqlite';

export type SystemEventLevel = 'INFO' | 'WARN' | 'ERROR';

export type SystemEventInput = {
  level: SystemEventLevel;
  source: string;
  message: string;
  userId?: string | null;
  campaignId?: string | null;
  details?: Record<string, unknown> | null;
};

export type SystemEventRow = {
  id: string;
  level: SystemEventLevel;
  source: string;
  message: string;
  userId: string | null;
  campaignId: string | null;
  details: string | null;
  createdAt: string;
};

export type SystemHealthSnapshot = {
  uptimeSeconds: number;
  queue: {
    queued: number;
    running: number;
    retrying: number;
    failed: number;
    skipped: number;
  };
  recentErrors24h: number;
  recentWarnings24h: number;
  lastError: {
    message: string;
    source: string;
    createdAt: string;
  } | null;
};

export type SystemHealthAlertLevel = 'critical' | 'warning' | 'info';

export type SystemHealthAlert = {
  key: string;
  level: SystemHealthAlertLevel;
  title: string;
  detail: string;
  action?: {
    label: string;
    href: string;
  };
};

let observabilitySchemaInitialized = false;

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export function ensureObservabilitySchema() {
  if (observabilitySchemaInitialized) return;

  executeSql(`
    CREATE TABLE IF NOT EXISTS "SystemEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "level" TEXT NOT NULL,
      "source" TEXT NOT NULL,
      "message" TEXT NOT NULL,
      "userId" TEXT,
      "campaignId" TEXT,
      "details" TEXT,
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SystemEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "SystemEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);

  executeSql('CREATE INDEX IF NOT EXISTS "SystemEvent_createdAt_idx" ON "SystemEvent" ("createdAt")');
  executeSql('CREATE INDEX IF NOT EXISTS "SystemEvent_level_createdAt_idx" ON "SystemEvent" ("level", "createdAt")');
  executeSql('CREATE INDEX IF NOT EXISTS "SystemEvent_source_createdAt_idx" ON "SystemEvent" ("source", "createdAt")');
  executeSql('CREATE INDEX IF NOT EXISTS "SystemEvent_campaignId_createdAt_idx" ON "SystemEvent" ("campaignId", "createdAt")');

  observabilitySchemaInitialized = true;
}

export function recordSystemEvent(input: SystemEventInput) {
  try {
    ensureObservabilitySchema();

    executeSql(
      `
        INSERT INTO "SystemEvent" (
          "id",
          "level",
          "source",
          "message",
          "userId",
          "campaignId",
          "details",
          "createdAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [
        crypto.randomUUID().replace(/-/g, ''),
        input.level,
        input.source,
        input.message,
        input.userId || null,
        input.campaignId || null,
        input.details ? safeJson(input.details) : null,
      ],
    );
  } catch (error) {
    console.error('system_event_record_failed', {
      source: input.source,
      level: input.level,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function listRecentSystemEvents(limit = 10) {
  ensureObservabilitySchema();

    return queryRows<SystemEventRow>(
    `
      SELECT "id", "level", "source", "message", "userId", "campaignId", "details", "createdAt"
      FROM "SystemEvent"
      ORDER BY "createdAt" DESC
      LIMIT ?
    `,
    [limit],
  );
}

export function getSystemHealthSnapshot(): SystemHealthSnapshot {
  ensureObservabilitySchema();

  const uptimeSeconds = Math.max(0, Math.round(process.uptime()));
  const queue = queryRow<{
    queued: number;
    running: number;
    retrying: number;
    failed: number;
    skipped: number;
  }>(
    `
      SELECT
        COALESCE(SUM(CASE WHEN status = 'QUEUED' THEN 1 ELSE 0 END), 0) as queued,
        COALESCE(SUM(CASE WHEN status = 'RUNNING' THEN 1 ELSE 0 END), 0) as running,
        COALESCE(SUM(CASE WHEN status = 'RETRYING' THEN 1 ELSE 0 END), 0) as retrying,
        COALESCE(SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END), 0) as failed,
        COALESCE(SUM(CASE WHEN status = 'SKIPPED' THEN 1 ELSE 0 END), 0) as skipped
      FROM "CampaignSendJob"
    `,
  );

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentErrors24h = queryRow<{ count: number }>(
    `SELECT COUNT(*) as count FROM "SystemEvent" WHERE "level" = 'ERROR' AND "createdAt" >= ?`,
    [since],
  )?.count || 0;
  const recentWarnings24h = queryRow<{ count: number }>(
    `SELECT COUNT(*) as count FROM "SystemEvent" WHERE "level" = 'WARN' AND "createdAt" >= ?`,
    [since],
  )?.count || 0;
  const lastError = queryRow<{
    message: string;
    source: string;
    createdAt: string;
  }>(
    `
      SELECT "message", "source", "createdAt"
      FROM "SystemEvent"
      WHERE "level" = 'ERROR'
      ORDER BY "createdAt" DESC
      LIMIT 1
    `,
  );

  return {
    uptimeSeconds,
    queue: {
      queued: queue?.queued || 0,
      running: queue?.running || 0,
      retrying: queue?.retrying || 0,
      failed: queue?.failed || 0,
      skipped: queue?.skipped || 0,
    },
    recentErrors24h,
    recentWarnings24h,
    lastError: lastError || null,
  };
}

export function buildSystemHealthAlerts(snapshot: SystemHealthSnapshot & { live?: ResourceSnapshot | null }): SystemHealthAlert[] {
  const alerts: SystemHealthAlert[] = [];
  const queuePressure = snapshot.queue.queued + snapshot.queue.running + snapshot.queue.retrying;

  if (snapshot.queue.failed > 0) {
    alerts.push({
      key: 'failed-jobs',
      level: 'critical',
      title: `${snapshot.queue.failed} failed queue job${snapshot.queue.failed === 1 ? '' : 's'}`,
      detail: 'One or more campaign sends exhausted retries or failed during dispatch. Review the recent system events and campaign queue before the next send.',
      action: { label: 'Open Help', href: '/dashboard/help' },
    });
  }

  if (snapshot.queue.retrying > 0) {
    alerts.push({
      key: 'retrying-jobs',
      level: 'warning',
      title: `${snapshot.queue.retrying} job${snapshot.queue.retrying === 1 ? '' : 's'} retrying`,
      detail: 'A send is still in backoff. Keep an eye on provider health and the queue until retries settle.',
      action: { label: 'Open Campaigns', href: '/dashboard/campaigns' },
    });
  }

  if (queuePressure >= 25) {
    alerts.push({
      key: 'queue-pressure',
      level: queuePressure >= 75 ? 'critical' : 'warning',
      title: 'Queue pressure is building',
      detail: `${queuePressure} send jobs are currently queued, running, or retrying. Consider pausing large sends until the backlog clears.`,
      action: { label: 'Open Resources', href: '/dashboard/resources' },
    });
  }

  if (snapshot.recentErrors24h >= 5) {
    alerts.push({
      key: 'error-burst',
      level: 'critical',
      title: `${snapshot.recentErrors24h} errors in the last 24h`,
      detail: 'Error volume crossed the critical threshold. Check recent system events and the latest queue failures first.',
      action: { label: 'Open Admin', href: '/dashboard/admin' },
    });
  } else if (snapshot.recentErrors24h > 0) {
    alerts.push({
      key: 'recent-errors',
      level: 'warning',
      title: `${snapshot.recentErrors24h} error${snapshot.recentErrors24h === 1 ? '' : 's'} in the last 24h`,
      detail: 'There have been recent errors, even if the platform is still serving requests. Review the latest system events to catch patterns early.',
      action: { label: 'Open Admin', href: '/dashboard/admin' },
    });
  }

  if (snapshot.recentWarnings24h >= 10) {
    alerts.push({
      key: 'warning-burst',
      level: 'warning',
      title: `${snapshot.recentWarnings24h} warnings in the last 24h`,
      detail: 'Warnings are stacking up. This usually means a provider, queue, or content flow needs attention before it becomes an error.',
      action: { label: 'Open Help', href: '/dashboard/help' },
    });
  }

  if (snapshot.lastError) {
    alerts.push({
      key: 'last-error',
      level: snapshot.recentErrors24h >= 5 ? 'critical' : 'warning',
      title: 'Latest error is still active in history',
      detail: `${snapshot.lastError.source}: ${snapshot.lastError.message}`,
      action: { label: 'Open Admin', href: '/dashboard/admin' },
    });
  }

  if (snapshot.live) {
    if (snapshot.live.memoryRssMb >= 1024) {
      alerts.push({
        key: 'memory-pressure',
        level: 'warning',
        title: 'Memory usage is high',
        detail: `The process is using ${snapshot.live.memoryRssMb.toFixed(1)} MB RSS. Large campaigns or webhook spikes may need a little more headroom.`,
        action: { label: 'Open Resources', href: '/dashboard/resources' },
      });
    }

    if (snapshot.live.eventLoopUtilization >= 60) {
      alerts.push({
        key: 'event-loop-pressure',
        level: 'warning',
        title: 'Event loop pressure is elevated',
        detail: `Event loop utilization is ${snapshot.live.eventLoopUtilization.toFixed(2)}%. That can mean send bursts or heavy requests are competing for runtime time.`,
        action: { label: 'Open Resources', href: '/dashboard/resources' },
      });
    }
  }

  return alerts;
}

export function captureHealthSnapshot() {
  return captureResourceSnapshot();
}
