import { randomUUID } from 'node:crypto';
import { ensureAuditSchema, recordAuditEvent } from '@/lib/audit';
import { ensureObservabilitySchema, recordSystemEvent } from '@/lib/observability';
import { executeSql, queryRow } from '@/lib/sqlite';
import { ensureCampaignSendQueueSchema } from '@/lib/campaign-send-queue';

type HousekeepingStateRow = {
  id: string;
  isEnabled: number | boolean;
  runEveryMinutes: number;
  auditLogRetentionDays: number;
  systemEventRetentionDays: number;
  sendJobRetentionDays: number;
  autoArchiveCampaignDays: number;
  archivedCampaignRetentionDays: number;
  lockToken: string | null;
  lockExpiresAt: string | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastStatus: string | null;
  lastTriggeredBy: string | null;
  lastSummaryJson: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HousekeepingScope =
  | 'auditLogs'
  | 'systemEvents'
  | 'sendJobs'
  | 'archiveCampaigns'
  | 'purgeArchivedCampaigns';

export type HousekeepingSettingsView = {
  isEnabled: boolean;
  runEveryMinutes: number;
  auditLogRetentionDays: number;
  systemEventRetentionDays: number;
  sendJobRetentionDays: number;
  autoArchiveCampaignDays: number;
  archivedCampaignRetentionDays: number;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastStatus: string | null;
  lastTriggeredBy: string | null;
  lastSummary: HousekeepingRunSummary | null;
  lockExpiresAt: string | null;
};

export type HousekeepingSnapshot = {
  auditLogsEligible: number;
  systemEventsEligible: number;
  sendJobsEligible: number;
  campaignsToArchive: number;
  archivedCampaignsToPurge: number;
};

export type HousekeepingRunSummary = {
  triggeredBy: string;
  mode: 'manual' | 'cron';
  startedAt: string;
  finishedAt: string | null;
  skippedReason?: 'disabled' | 'not_due' | 'locked';
  scopes: HousekeepingScope[];
  affected: {
    auditLogsDeleted: number;
    systemEventsDeleted: number;
    sendJobsDeleted: number;
    campaignsArchived: number;
    archivedCampaignsDeleted: number;
  };
};

type SaveHousekeepingSettingsInput = {
  isEnabled?: boolean;
  runEveryMinutes?: number;
  auditLogRetentionDays?: number;
  systemEventRetentionDays?: number;
  sendJobRetentionDays?: number;
  autoArchiveCampaignDays?: number;
  archivedCampaignRetentionDays?: number;
};

type RunHousekeepingOptions = {
  triggeredBy: string;
  mode: 'manual' | 'cron';
  force?: boolean;
  scopes?: HousekeepingScope[];
};

const DEFAULTS = {
  isEnabled: true,
  runEveryMinutes: 720,
  auditLogRetentionDays: 90,
  systemEventRetentionDays: 30,
  sendJobRetentionDays: 30,
  autoArchiveCampaignDays: 30,
  archivedCampaignRetentionDays: 180,
};

const LOCK_LEASE_MS = 10 * 60 * 1000;

let housekeepingSchemaInitialized = false;

function hasPostgresDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

function columnExists(tableName: string, columnName: string) {
  if (hasPostgresDatabase()) {
    const row = queryRow<{ present: number }>(
      `
        SELECT 1 AS present
        FROM information_schema.columns
        WHERE table_schema = CURRENT_SCHEMA()
          AND table_name = ?
          AND column_name = ?
        LIMIT 1
      `,
      [tableName, columnName],
    );
    return Boolean(row?.present);
  }

  const row = queryRow<{ present: number }>(
    `
      SELECT 1 AS present
      FROM pragma_table_info(?)
      WHERE name = ?
      LIMIT 1
    `,
    [tableName, columnName],
  );
  return Boolean(row?.present);
}

function parseBoolean(value: number | boolean | null | undefined, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

function parsePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function dateValue(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseRunSummary(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as HousekeepingRunSummary;
  } catch {
    return null;
  }
}

function mapState(row: HousekeepingStateRow | null): HousekeepingSettingsView {
  return {
    isEnabled: parseBoolean(row?.isEnabled, DEFAULTS.isEnabled),
    runEveryMinutes: parsePositiveInteger(row?.runEveryMinutes, DEFAULTS.runEveryMinutes),
    auditLogRetentionDays: parsePositiveInteger(row?.auditLogRetentionDays, DEFAULTS.auditLogRetentionDays),
    systemEventRetentionDays: parsePositiveInteger(row?.systemEventRetentionDays, DEFAULTS.systemEventRetentionDays),
    sendJobRetentionDays: parsePositiveInteger(row?.sendJobRetentionDays, DEFAULTS.sendJobRetentionDays),
    autoArchiveCampaignDays: parsePositiveInteger(row?.autoArchiveCampaignDays, DEFAULTS.autoArchiveCampaignDays),
    archivedCampaignRetentionDays: parsePositiveInteger(
      row?.archivedCampaignRetentionDays,
      DEFAULTS.archivedCampaignRetentionDays,
    ),
    lastStartedAt: row?.lastStartedAt || null,
    lastFinishedAt: row?.lastFinishedAt || null,
    lastStatus: row?.lastStatus || null,
    lastTriggeredBy: row?.lastTriggeredBy || null,
    lastSummary: parseRunSummary(row?.lastSummaryJson || null),
    lockExpiresAt: row?.lockExpiresAt || null,
  };
}

export function ensureHousekeepingSchema() {
  if (housekeepingSchemaInitialized) return;

  ensureAuditSchema();
  ensureObservabilitySchema();
  ensureCampaignSendQueueSchema();

  executeSql(`
    CREATE TABLE IF NOT EXISTS "HousekeepingState" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "isEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
      "runEveryMinutes" INTEGER NOT NULL DEFAULT 720,
      "auditLogRetentionDays" INTEGER NOT NULL DEFAULT 90,
      "systemEventRetentionDays" INTEGER NOT NULL DEFAULT 30,
      "sendJobRetentionDays" INTEGER NOT NULL DEFAULT 30,
      "autoArchiveCampaignDays" INTEGER NOT NULL DEFAULT 30,
      "archivedCampaignRetentionDays" INTEGER NOT NULL DEFAULT 180,
      "lockToken" TEXT,
      "lockExpiresAt" TEXT,
      "lastStartedAt" TEXT,
      "lastFinishedAt" TEXT,
      "lastStatus" TEXT,
      "lastTriggeredBy" TEXT,
      "lastSummaryJson" TEXT,
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const optionalColumns = [
    ['isEnabled', 'BOOLEAN NOT NULL DEFAULT TRUE'],
    ['runEveryMinutes', 'INTEGER NOT NULL DEFAULT 720'],
    ['auditLogRetentionDays', 'INTEGER NOT NULL DEFAULT 90'],
    ['systemEventRetentionDays', 'INTEGER NOT NULL DEFAULT 30'],
    ['sendJobRetentionDays', 'INTEGER NOT NULL DEFAULT 30'],
    ['autoArchiveCampaignDays', 'INTEGER NOT NULL DEFAULT 30'],
    ['archivedCampaignRetentionDays', 'INTEGER NOT NULL DEFAULT 180'],
    ['lockToken', 'TEXT'],
    ['lockExpiresAt', hasPostgresDatabase() ? 'TIMESTAMPTZ' : 'TEXT'],
    ['lastStartedAt', hasPostgresDatabase() ? 'TIMESTAMPTZ' : 'TEXT'],
    ['lastFinishedAt', hasPostgresDatabase() ? 'TIMESTAMPTZ' : 'TEXT'],
    ['lastStatus', 'TEXT'],
    ['lastTriggeredBy', 'TEXT'],
    ['lastSummaryJson', 'TEXT'],
  ] as const;

  for (const [columnName, definition] of optionalColumns) {
    if (!columnExists('HousekeepingState', columnName)) {
      executeSql(`ALTER TABLE "HousekeepingState" ADD COLUMN "${columnName}" ${definition}`);
    }
  }

  executeSql(
    `
      INSERT INTO "HousekeepingState" (
        "id",
        "isEnabled",
        "runEveryMinutes",
        "auditLogRetentionDays",
        "systemEventRetentionDays",
        "sendJobRetentionDays",
        "autoArchiveCampaignDays",
        "archivedCampaignRetentionDays",
        "createdAt",
        "updatedAt"
      )
      VALUES ('global', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT("id") DO NOTHING
    `,
    [
      DEFAULTS.isEnabled,
      DEFAULTS.runEveryMinutes,
      DEFAULTS.auditLogRetentionDays,
      DEFAULTS.systemEventRetentionDays,
      DEFAULTS.sendJobRetentionDays,
      DEFAULTS.autoArchiveCampaignDays,
      DEFAULTS.archivedCampaignRetentionDays,
    ],
  );

  housekeepingSchemaInitialized = true;
}

function getStateRow() {
  ensureHousekeepingSchema();
  return queryRow<HousekeepingStateRow>(
    `
      SELECT
        "id",
        "isEnabled",
        "runEveryMinutes",
        "auditLogRetentionDays",
        "systemEventRetentionDays",
        "sendJobRetentionDays",
        "autoArchiveCampaignDays",
        "archivedCampaignRetentionDays",
        "lockToken",
        "lockExpiresAt",
        "lastStartedAt",
        "lastFinishedAt",
        "lastStatus",
        "lastTriggeredBy",
        "lastSummaryJson",
        "createdAt",
        "updatedAt"
      FROM "HousekeepingState"
      WHERE "id" = 'global'
      LIMIT 1
    `,
  );
}

export function getHousekeepingSettings() {
  return mapState(getStateRow());
}

export function saveHousekeepingSettings(input: SaveHousekeepingSettingsInput) {
  ensureHousekeepingSchema();
  const current = getHousekeepingSettings();
  const next = {
    isEnabled: typeof input.isEnabled === 'boolean' ? input.isEnabled : current.isEnabled,
    runEveryMinutes: parsePositiveInteger(input.runEveryMinutes, current.runEveryMinutes),
    auditLogRetentionDays: parsePositiveInteger(input.auditLogRetentionDays, current.auditLogRetentionDays),
    systemEventRetentionDays: parsePositiveInteger(input.systemEventRetentionDays, current.systemEventRetentionDays),
    sendJobRetentionDays: parsePositiveInteger(input.sendJobRetentionDays, current.sendJobRetentionDays),
    autoArchiveCampaignDays: parsePositiveInteger(input.autoArchiveCampaignDays, current.autoArchiveCampaignDays),
    archivedCampaignRetentionDays: parsePositiveInteger(
      input.archivedCampaignRetentionDays,
      current.archivedCampaignRetentionDays,
    ),
  };

  executeSql(
    `
      UPDATE "HousekeepingState"
      SET
        "isEnabled" = ?,
        "runEveryMinutes" = ?,
        "auditLogRetentionDays" = ?,
        "systemEventRetentionDays" = ?,
        "sendJobRetentionDays" = ?,
        "autoArchiveCampaignDays" = ?,
        "archivedCampaignRetentionDays" = ?,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = 'global'
    `,
    [
      next.isEnabled,
      next.runEveryMinutes,
      next.auditLogRetentionDays,
      next.systemEventRetentionDays,
      next.sendJobRetentionDays,
      next.autoArchiveCampaignDays,
      next.archivedCampaignRetentionDays,
    ],
  );

  return getHousekeepingSettings();
}

export function getHousekeepingSnapshot(settings = getHousekeepingSettings()): HousekeepingSnapshot {
  ensureHousekeepingSchema();

  const auditLogsEligible =
    settings.auditLogRetentionDays > 0
      ? queryRow<{ count: number }>(
          `SELECT COUNT(*) as count FROM "AuditLog" WHERE "createdAt" < ?`,
          [daysAgoIso(settings.auditLogRetentionDays)],
        )?.count || 0
      : 0;
  const systemEventsEligible =
    settings.systemEventRetentionDays > 0
      ? queryRow<{ count: number }>(
          `SELECT COUNT(*) as count FROM "SystemEvent" WHERE "createdAt" < ?`,
          [daysAgoIso(settings.systemEventRetentionDays)],
        )?.count || 0
      : 0;
  const sendJobsEligible =
    settings.sendJobRetentionDays > 0
      ? queryRow<{ count: number }>(
          `
            SELECT COUNT(*) as count
            FROM "CampaignSendJob"
            WHERE status IN ('SENT', 'FAILED', 'SKIPPED')
              AND COALESCE("finishedAt", "updatedAt", "createdAt") < ?
          `,
          [daysAgoIso(settings.sendJobRetentionDays)],
        )?.count || 0
      : 0;
  const campaignsToArchive =
    settings.autoArchiveCampaignDays > 0
      ? queryRow<{ count: number }>(
          `
            SELECT COUNT(*) as count
            FROM "Campaign"
            WHERE COALESCE("isArchived", FALSE) = FALSE
              AND status IN ('SENT', 'FAILED', 'SKIPPED')
              AND COALESCE("finishedAt", "updatedAt", "createdAt") < ?
          `,
          [daysAgoIso(settings.autoArchiveCampaignDays)],
        )?.count || 0
      : 0;
  const archivedCampaignsToPurge =
    settings.archivedCampaignRetentionDays > 0
      ? queryRow<{ count: number }>(
          `
            SELECT COUNT(*) as count
            FROM "Campaign"
            WHERE COALESCE("isArchived", FALSE) = TRUE
              AND COALESCE("finishedAt", "updatedAt", "createdAt") < ?
          `,
          [daysAgoIso(settings.archivedCampaignRetentionDays)],
        )?.count || 0
      : 0;

  return {
    auditLogsEligible,
    systemEventsEligible,
    sendJobsEligible,
    campaignsToArchive,
    archivedCampaignsToPurge,
  };
}

function acquireLease(triggeredBy: string) {
  ensureHousekeepingSchema();
  const token = randomUUID().replace(/-/g, '');
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresIso = new Date(now.getTime() + LOCK_LEASE_MS).toISOString();
  const claim = executeSql(
    `
      UPDATE "HousekeepingState"
      SET
        "lockToken" = ?,
        "lockExpiresAt" = ?,
        "lastStartedAt" = ?,
        "lastTriggeredBy" = ?,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = 'global'
        AND ("lockExpiresAt" IS NULL OR "lockExpiresAt" < ?)
    `,
    [token, expiresIso, nowIso, triggeredBy, nowIso],
  );

  if ((claim.rowCount ?? claim.changes ?? 0) !== 1) return null;
  return { token, nowIso };
}

function completeLease(token: string, status: string, summary: HousekeepingRunSummary) {
  executeSql(
    `
      UPDATE "HousekeepingState"
      SET
        "lockToken" = NULL,
        "lockExpiresAt" = NULL,
        "lastFinishedAt" = ?,
        "lastStatus" = ?,
        "lastSummaryJson" = ?,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = 'global' AND "lockToken" = ?
    `,
    [summary.finishedAt || new Date().toISOString(), status, JSON.stringify(summary), token],
  );
}

function shouldRunNow(settings: HousekeepingSettingsView) {
  if (!settings.isEnabled) return false;
  if (settings.runEveryMinutes <= 0) return false;
  if (!settings.lastFinishedAt) return true;
  return Date.now() - dateValue(settings.lastFinishedAt) >= settings.runEveryMinutes * 60 * 1000;
}

function buildDefaultScopes(): HousekeepingScope[] {
  return ['auditLogs', 'systemEvents', 'sendJobs', 'archiveCampaigns', 'purgeArchivedCampaigns'];
}

function deleteAuditLogs(days: number) {
  if (days <= 0) return 0;
  const result = executeSql(`DELETE FROM "AuditLog" WHERE "createdAt" < ?`, [daysAgoIso(days)]);
  return result.rowCount ?? result.changes ?? 0;
}

function deleteSystemEvents(days: number) {
  if (days <= 0) return 0;
  const result = executeSql(`DELETE FROM "SystemEvent" WHERE "createdAt" < ?`, [daysAgoIso(days)]);
  return result.rowCount ?? result.changes ?? 0;
}

function deleteFinishedSendJobs(days: number) {
  if (days <= 0) return 0;
  const result = executeSql(
    `
      DELETE FROM "CampaignSendJob"
      WHERE status IN ('SENT', 'FAILED', 'SKIPPED')
        AND COALESCE("finishedAt", "updatedAt", "createdAt") < ?
    `,
    [daysAgoIso(days)],
  );
  return result.rowCount ?? result.changes ?? 0;
}

function archiveCompletedCampaigns(days: number) {
  if (days <= 0) return 0;
  const result = executeSql(
    `
      UPDATE "Campaign"
      SET "isArchived" = TRUE, "updatedAt" = CURRENT_TIMESTAMP
      WHERE COALESCE("isArchived", FALSE) = FALSE
        AND status IN ('SENT', 'FAILED', 'SKIPPED')
        AND COALESCE("finishedAt", "updatedAt", "createdAt") < ?
    `,
    [daysAgoIso(days)],
  );
  return result.rowCount ?? result.changes ?? 0;
}

function purgeArchivedCampaigns(days: number) {
  if (days <= 0) return 0;
  const result = executeSql(
    `
      DELETE FROM "Campaign"
      WHERE COALESCE("isArchived", FALSE) = TRUE
        AND COALESCE("finishedAt", "updatedAt", "createdAt") < ?
    `,
    [daysAgoIso(days)],
  );
  return result.rowCount ?? result.changes ?? 0;
}

export async function runHousekeeping(options: RunHousekeepingOptions) {
  ensureHousekeepingSchema();
  const settings = getHousekeepingSettings();
  const scopes = options.scopes?.length ? options.scopes : buildDefaultScopes();
  const startedAt = new Date().toISOString();

  if (!options.force && !settings.isEnabled) {
    return {
      settings,
      snapshot: getHousekeepingSnapshot(settings),
      summary: {
        triggeredBy: options.triggeredBy,
        mode: options.mode,
        startedAt,
        finishedAt: startedAt,
        skippedReason: 'disabled',
        scopes,
        affected: {
          auditLogsDeleted: 0,
          systemEventsDeleted: 0,
          sendJobsDeleted: 0,
          campaignsArchived: 0,
          archivedCampaignsDeleted: 0,
        },
      } satisfies HousekeepingRunSummary,
    };
  }

  if (!options.force && options.mode === 'cron' && !shouldRunNow(settings)) {
    return {
      settings,
      snapshot: getHousekeepingSnapshot(settings),
      summary: {
        triggeredBy: options.triggeredBy,
        mode: options.mode,
        startedAt,
        finishedAt: startedAt,
        skippedReason: 'not_due',
        scopes,
        affected: {
          auditLogsDeleted: 0,
          systemEventsDeleted: 0,
          sendJobsDeleted: 0,
          campaignsArchived: 0,
          archivedCampaignsDeleted: 0,
        },
      } satisfies HousekeepingRunSummary,
    };
  }

  const lease = acquireLease(options.triggeredBy);
  if (!lease) {
    return {
      settings,
      snapshot: getHousekeepingSnapshot(settings),
      summary: {
        triggeredBy: options.triggeredBy,
        mode: options.mode,
        startedAt,
        finishedAt: startedAt,
        skippedReason: 'locked',
        scopes,
        affected: {
          auditLogsDeleted: 0,
          systemEventsDeleted: 0,
          sendJobsDeleted: 0,
          campaignsArchived: 0,
          archivedCampaignsDeleted: 0,
        },
      } satisfies HousekeepingRunSummary,
    };
  }

  const summary: HousekeepingRunSummary = {
    triggeredBy: options.triggeredBy,
    mode: options.mode,
    startedAt: lease.nowIso,
    finishedAt: null,
    scopes,
    affected: {
      auditLogsDeleted: 0,
      systemEventsDeleted: 0,
      sendJobsDeleted: 0,
      campaignsArchived: 0,
      archivedCampaignsDeleted: 0,
    },
  };

  try {
    if (scopes.includes('auditLogs')) {
      summary.affected.auditLogsDeleted = deleteAuditLogs(settings.auditLogRetentionDays);
    }
    if (scopes.includes('systemEvents')) {
      summary.affected.systemEventsDeleted = deleteSystemEvents(settings.systemEventRetentionDays);
    }
    if (scopes.includes('sendJobs')) {
      summary.affected.sendJobsDeleted = deleteFinishedSendJobs(settings.sendJobRetentionDays);
    }
    if (scopes.includes('archiveCampaigns')) {
      summary.affected.campaignsArchived = archiveCompletedCampaigns(settings.autoArchiveCampaignDays);
    }
    if (scopes.includes('purgeArchivedCampaigns')) {
      summary.affected.archivedCampaignsDeleted = purgeArchivedCampaigns(settings.archivedCampaignRetentionDays);
    }

    summary.finishedAt = new Date().toISOString();
    completeLease(lease.token, 'SUCCESS', summary);
    recordSystemEvent({
      level: 'INFO',
      source: 'housekeeping',
      message: 'Housekeeping run completed.',
      details: summary,
    });

    return {
      settings: getHousekeepingSettings(),
      snapshot: getHousekeepingSnapshot(),
      summary,
    };
  } catch (error) {
    summary.finishedAt = new Date().toISOString();
    completeLease(lease.token, 'FAILED', summary);
    recordSystemEvent({
      level: 'ERROR',
      source: 'housekeeping',
      message: error instanceof Error ? error.message : 'Housekeeping run failed.',
      details: {
        triggeredBy: options.triggeredBy,
        mode: options.mode,
        scopes,
      },
    });
    throw error;
  }
}

export function mapActionToScopes(action: string): HousekeepingScope[] {
  switch (action) {
    case 'archiveCampaigns':
      return ['archiveCampaigns'];
    case 'purgeArchivedCampaigns':
      return ['purgeArchivedCampaigns'];
    case 'auditLogs':
      return ['auditLogs'];
    case 'systemEvents':
      return ['systemEvents'];
    case 'sendJobs':
      return ['sendJobs'];
    default:
      return buildDefaultScopes();
  }
}

export async function recordHousekeepingAudit(actor: {
  userId: string;
  email: string;
  role: string;
}, action: string, summary: HousekeepingRunSummary | null, settings?: SaveHousekeepingSettingsInput) {
  await recordAuditEvent({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action,
    entityType: 'HousekeepingState',
    entityId: 'global',
    scopeType: 'GLOBAL',
    metadata: summary ? summary : settings || null,
  });
}
