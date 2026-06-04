import crypto from 'node:crypto';

import { getCampaignLists } from '@/lib/campaign-lists';
import { recordSystemEvent } from '@/lib/observability';
import { dispatchCampaignEmails } from '@/lib/providers/email';
import { executeSql, queryRow, queryRows } from '@/lib/sqlite';

type CampaignRow = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  status: string;
  provider: string | null;
  isArchived: number | boolean;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  userId: string;
  listId: string;
  templateId: string | null;
};

type CampaignSendJobRow = {
  id: string;
  campaignId: string;
  userId: string;
  status: string;
  attempts: number;
  provider: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  quotaSkippedCount: number;
  remainingToday: number;
  requestedAt: string;
  startedAt: string | null;
  nextRunAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  skipReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type CampaignSendJobResult = {
  outcome: 'SENT' | 'FAILED' | 'SKIPPED' | 'PAUSED' | 'CANCELLED';
  provider: string;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  totalRecipients: number;
  quotaSkippedCount: number;
  remainingToday: number;
};

const SENDABLE_STATUSES = new Set(['DRAFT', 'SCHEDULED']);
const ACTIVE_JOB_STATUSES = new Set(['QUEUED', 'RUNNING', 'RETRYING', 'PAUSED']);
const NON_EDITABLE_CAMPAIGN_STATUSES = new Set(['QUEUED', 'RETRYING', 'SENDING', 'PAUSED']);
const MAX_RETRY_ATTEMPTS = 3;
const WORKER_INTERVAL_MS = 1500;
const DEFAULT_STALE_RUNNING_MS = 30 * 60 * 1000;

let campaignSendQueueSchemaInitialized = false;

const globalQueueState = globalThis as typeof globalThis & {
  __mailflowCampaignSendQueueWorker?: {
    started: boolean;
    draining: boolean;
    timer: NodeJS.Timeout | null;
  };
};

const workerState =
  globalQueueState.__mailflowCampaignSendQueueWorker ||
  (globalQueueState.__mailflowCampaignSendQueueWorker = {
    started: false,
    draining: false,
    timer: null,
  });

function getBackgroundAppOrigin() {
  const envOrigin =
    process.env.APP_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.COOLIFY_URL?.trim() ||
    '';

  if (envOrigin) {
    try {
      return new URL(envOrigin).origin;
    } catch {
      // fall through to the local fallback below
    }
  }

  return 'http://localhost:3000';
}

function getStaleRunningMs() {
  const configured = Number(process.env.CAMPAIGN_SEND_STALE_RUNNING_MS || '');
  if (Number.isFinite(configured) && configured >= 60000) return configured;
  return DEFAULT_STALE_RUNNING_MS;
}

function dateValue(value: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ensureCampaignSendQueueColumns() {
  if (process.env.DATABASE_URL) {
    executeSql('ALTER TABLE "CampaignSendJob" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0');
    executeSql('ALTER TABLE "CampaignSendJob" ADD COLUMN IF NOT EXISTS "provider" TEXT');
    executeSql('ALTER TABLE "CampaignSendJob" ADD COLUMN IF NOT EXISTS "totalRecipients" INTEGER NOT NULL DEFAULT 0');
    executeSql('ALTER TABLE "CampaignSendJob" ADD COLUMN IF NOT EXISTS "sentCount" INTEGER NOT NULL DEFAULT 0');
    executeSql('ALTER TABLE "CampaignSendJob" ADD COLUMN IF NOT EXISTS "failedCount" INTEGER NOT NULL DEFAULT 0');
    executeSql('ALTER TABLE "CampaignSendJob" ADD COLUMN IF NOT EXISTS "skippedCount" INTEGER NOT NULL DEFAULT 0');
    executeSql('ALTER TABLE "CampaignSendJob" ADD COLUMN IF NOT EXISTS "quotaSkippedCount" INTEGER NOT NULL DEFAULT 0');
    executeSql('ALTER TABLE "CampaignSendJob" ADD COLUMN IF NOT EXISTS "remainingToday" INTEGER NOT NULL DEFAULT 0');
    executeSql('ALTER TABLE "CampaignSendJob" ADD COLUMN IF NOT EXISTS "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()');
    executeSql('ALTER TABLE "CampaignSendJob" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMPTZ');
    executeSql('ALTER TABLE "CampaignSendJob" ADD COLUMN IF NOT EXISTS "nextRunAt" TIMESTAMPTZ');
    executeSql('ALTER TABLE "CampaignSendJob" ADD COLUMN IF NOT EXISTS "finishedAt" TIMESTAMPTZ');
    executeSql('ALTER TABLE "CampaignSendJob" ADD COLUMN IF NOT EXISTS "lastError" TEXT');
    executeSql('ALTER TABLE "CampaignSendJob" ADD COLUMN IF NOT EXISTS "skipReason" TEXT');
    executeSql('ALTER TABLE "CampaignSendJob" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()');
    executeSql('ALTER TABLE "CampaignSendJob" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()');
    return;
  }

  const columns = new Set(
    queryRows<{ name: string }>('PRAGMA table_info("CampaignSendJob")').map((column) => column.name),
  );
  const addColumn = (name: string, definition: string) => {
    if (columns.has(name)) return;
    executeSql(`ALTER TABLE "CampaignSendJob" ADD COLUMN "${name}" ${definition}`);
    columns.add(name);
  };

  addColumn('attempts', "INTEGER NOT NULL DEFAULT 0");
  addColumn('provider', 'TEXT');
  addColumn('totalRecipients', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('sentCount', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('failedCount', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('skippedCount', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('quotaSkippedCount', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('remainingToday', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('requestedAt', 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP');
  addColumn('startedAt', 'TEXT');
  addColumn('nextRunAt', 'TEXT');
  addColumn('finishedAt', 'TEXT');
  addColumn('lastError', 'TEXT');
  addColumn('skipReason', 'TEXT');
  addColumn('createdAt', 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP');
  addColumn('updatedAt', 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP');
}

export function ensureCampaignSendQueueSchema() {
  if (campaignSendQueueSchemaInitialized) return;

  executeSql(`
    CREATE TABLE IF NOT EXISTS "CampaignSendJob" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "campaignId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'QUEUED',
      "attempts" INTEGER NOT NULL DEFAULT 0,
      "provider" TEXT,
      "totalRecipients" INTEGER NOT NULL DEFAULT 0,
      "sentCount" INTEGER NOT NULL DEFAULT 0,
      "failedCount" INTEGER NOT NULL DEFAULT 0,
      "skippedCount" INTEGER NOT NULL DEFAULT 0,
      "quotaSkippedCount" INTEGER NOT NULL DEFAULT 0,
      "remainingToday" INTEGER NOT NULL DEFAULT 0,
      "requestedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "startedAt" TEXT,
      "nextRunAt" TEXT,
      "finishedAt" TEXT,
      "lastError" TEXT,
      "skipReason" TEXT,
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CampaignSendJob_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "CampaignSendJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  ensureCampaignSendQueueColumns();
  executeSql('CREATE INDEX IF NOT EXISTS "CampaignSendJob_status_requestedAt_idx" ON "CampaignSendJob" ("status", "requestedAt")');
  executeSql('CREATE INDEX IF NOT EXISTS "CampaignSendJob_campaignId_idx" ON "CampaignSendJob" ("campaignId")');

  campaignSendQueueSchemaInitialized = true;
}

function loadCampaign(campaignId: string, userId: string) {
  return queryRow<CampaignRow>(
    `
      SELECT
        c.id,
        c.name,
        c.subject,
        c."bodyHtml",
        c.status,
        c.provider,
        CASE WHEN COALESCE(c."isArchived", FALSE) THEN 1 ELSE 0 END as "isArchived",
        c."totalRecipients",
        c."sentCount",
        c."failedCount",
        c."skippedCount",
        c."userId",
        c."listId",
        c."templateId"
      FROM "Campaign" c
      WHERE c.id = ? AND c."userId" = ?
      LIMIT 1
    `,
    [campaignId, userId],
  );
}

function loadCampaignRecipients(campaign: CampaignRow, userId: string) {
  const selectedLists = getCampaignLists(campaign.id, userId);
  const listIds = selectedLists.length > 0 ? selectedLists.map((list) => list.id) : [];
  const effectiveListIds = listIds.length > 0 ? listIds : [campaign.listId];

  return queryRows<{
    id: string;
    email: string;
    status: string;
  }>(
    `
      SELECT c.id, c.email, c.status
      FROM "Contact" c
      INNER JOIN "List" l ON l.id = c."listId"
      WHERE l.id IN (${effectiveListIds.map(() => '?').join(', ')}) AND l."userId" = ?
      ORDER BY c."createdAt" ASC
    `,
    [...effectiveListIds, userId],
  );
}

function getRetryDelayMs(attemptNumber: number) {
  const baseDelay = 2000;
  const capped = Math.min(60000, baseDelay * (2 ** Math.max(0, attemptNumber - 1)));
  return capped;
}

function isRetryableSendError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /timeout|timed out|econnreset|econnrefused|429|rate limit|temporarily|socket hang up|network|fetch failed|5\d{2}/i.test(message);
}

function getCampaignFinalStatus(result: CampaignSendJobResult) {
  if (result.outcome === 'PAUSED') return 'PAUSED';
  if (result.outcome === 'CANCELLED') return 'CANCELLED';
  if (result.sentCount === 0 && result.failedCount === 0 && result.skippedCount > 0) {
    return 'SKIPPED';
  }

  if (result.failedCount > 0 && result.sentCount === 0) {
    return 'FAILED';
  }

  return 'SENT';
}

function getJobStatus(jobId: string) {
  const job = queryRow<{ status: string }>(
    `SELECT status FROM "CampaignSendJob" WHERE id = ? LIMIT 1`,
    [jobId],
  );
  return String(job?.status || 'RUNNING').toUpperCase();
}

export function isCampaignLockedForEditing(status: string | null | undefined) {
  return NON_EDITABLE_CAMPAIGN_STATUSES.has(String(status || '').toUpperCase());
}

export function queueCampaignSendJob(userId: string, campaignId: string) {
  ensureCampaignSendQueueSchema();

  const campaign = loadCampaign(campaignId, userId);
  if (!campaign) {
    throw new Error('Campaign not found.');
  }
  if (campaign.isArchived) {
    throw new Error('Archived campaigns cannot be queued.');
  }

  if (!SENDABLE_STATUSES.has(campaign.status)) {
    throw new Error('Only DRAFT or SCHEDULED campaigns can be queued.');
  }

  const activeJob = queryRow<{ id: string; status: string }>(
    `
      SELECT id, status
      FROM "CampaignSendJob"
      WHERE "campaignId" = ? AND status IN ('QUEUED', 'RUNNING', 'RETRYING', 'PAUSED')
      LIMIT 1
    `,
    [campaignId],
  );
  if (activeJob) {
    throw new Error('Campaign send is already queued.');
  }

  const jobId = crypto.randomUUID().replace(/-/g, '');
  const timestamp = new Date().toISOString();

  executeSql(
    `
      INSERT INTO "CampaignSendJob" (
        id, "campaignId", "userId", status, attempts, provider,
          "totalRecipients", "sentCount", "failedCount", "skippedCount",
            "quotaSkippedCount", "remainingToday", "requestedAt", "startedAt",
        "nextRunAt", "finishedAt", "lastError", "skipReason", "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      jobId,
      campaignId,
      userId,
      'QUEUED',
      0,
      null,
      0,
      0,
      0,
      0,
      0,
      0,
      timestamp,
      null,
      timestamp,
      null,
      null,
      null,
      timestamp,
      timestamp,
    ],
  );

  executeSql(
    `
      UPDATE "Campaign"
      SET
        status = ?,
        provider = NULL,
        "totalRecipients" = 0,
        "sentCount" = 0,
        "failedCount" = 0,
        "skippedCount" = 0,
        "startedAt" = NULL,
        "finishedAt" = NULL,
        "durationSeconds" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ? AND "userId" = ?
    `,
    ['QUEUED', campaignId, userId],
  );

  startCampaignSendQueueWorker();

  return {
    jobId,
    campaignId,
    status: 'QUEUED' as const,
    listCount: getCampaignLists(campaignId, userId).length || 1,
  };
}

export function controlCampaignSendJob(
  userId: string,
  campaignId: string,
  action: 'pause' | 'resume' | 'cancel',
) {
  ensureCampaignSendQueueSchema();

  const campaign = loadCampaign(campaignId, userId);
  if (!campaign) {
    throw new Error('Campaign not found.');
  }

  const latestJob = queryRow<CampaignSendJobRow>(
    `
      SELECT
        id, "campaignId", "userId", status, attempts, provider,
        "totalRecipients", "sentCount", "failedCount", "skippedCount",
        "quotaSkippedCount", "remainingToday", "requestedAt", "startedAt",
        "nextRunAt", "finishedAt", "lastError", "skipReason", "createdAt", "updatedAt"
      FROM "CampaignSendJob"
      WHERE "campaignId" = ?
      ORDER BY "createdAt" DESC
      LIMIT 1
    `,
    [campaignId],
  );

  if (!latestJob) {
    throw new Error('No queued send job was found for this campaign.');
  }

  const now = new Date().toISOString();

  if (action === 'pause') {
    if (!['QUEUED', 'RETRYING', 'RUNNING'].includes(latestJob.status)) {
      throw new Error('Only queued, retrying, or running campaigns can be paused.');
    }

    executeSql(
      `
        UPDATE "CampaignSendJob"
        SET status = 'PAUSED', "nextRunAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP, "skipReason" = NULL
        WHERE id = ? AND status IN ('QUEUED', 'RETRYING', 'RUNNING')
      `,
      [latestJob.id],
    );
    executeSql(
      `
        UPDATE "Campaign"
        SET status = 'PAUSED', "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ? AND "userId" = ?
      `,
      [campaignId, userId],
    );
    recordSystemEvent({
      level: 'INFO',
      source: 'campaign_send_control',
      message: 'Campaign send paused by operator.',
      campaignId,
      userId,
      details: { jobId: latestJob.id, action },
    });
    return { jobId: latestJob.id, status: 'PAUSED' as const };
  }

  if (action === 'resume') {
    if (latestJob.status !== 'PAUSED') {
      throw new Error('Only paused campaigns can be resumed.');
    }

    executeSql(
      `
        UPDATE "CampaignSendJob"
        SET
          status = 'QUEUED',
          "nextRunAt" = ?,
          "finishedAt" = NULL,
          "updatedAt" = CURRENT_TIMESTAMP,
          "lastError" = NULL,
          "skipReason" = NULL
        WHERE id = ? AND status = 'PAUSED'
      `,
      [now, latestJob.id],
    );
    executeSql(
      `
        UPDATE "Campaign"
        SET status = 'QUEUED', "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ? AND "userId" = ?
      `,
      [campaignId, userId],
    );
    recordSystemEvent({
      level: 'INFO',
      source: 'campaign_send_control',
      message: 'Campaign send resumed by operator.',
      campaignId,
      userId,
      details: { jobId: latestJob.id, action },
    });
    startCampaignSendQueueWorker();
    return { jobId: latestJob.id, status: 'QUEUED' as const };
  }

  if (!['QUEUED', 'RETRYING', 'RUNNING', 'PAUSED'].includes(latestJob.status)) {
    throw new Error('Only queued, retrying, running, or paused campaigns can be cancelled.');
  }

  executeSql(
    `
      UPDATE "CampaignSendJob"
      SET
        status = 'CANCELLED',
        "nextRunAt" = NULL,
        "finishedAt" = CASE WHEN status IN ('QUEUED', 'RETRYING', 'PAUSED') THEN ? ELSE "finishedAt" END,
        "updatedAt" = CURRENT_TIMESTAMP,
        "skipReason" = 'Campaign send cancelled by operator.'
      WHERE id = ? AND status IN ('QUEUED', 'RETRYING', 'RUNNING', 'PAUSED')
    `,
    [now, latestJob.id],
  );
  executeSql(
    `
      UPDATE "Campaign"
      SET status = 'CANCELLED', "updatedAt" = CURRENT_TIMESTAMP, "finishedAt" = COALESCE("finishedAt", ?)
      WHERE id = ? AND "userId" = ?
    `,
    [now, campaignId, userId],
  );
  recordSystemEvent({
    level: 'WARN',
    source: 'campaign_send_control',
    message: 'Campaign send cancelled by operator.',
    campaignId,
    userId,
    details: { jobId: latestJob.id, action },
  });
  return { jobId: latestJob.id, status: 'CANCELLED' as const };
}

async function processQueuedCampaignSendJob(job: CampaignSendJobRow) {
  const campaign = loadCampaign(job.campaignId, job.userId);
  if (!campaign) {
    executeSql(
      `
        UPDATE "CampaignSendJob"
        SET status = ?, "lastError" = ?, "skipReason" = ?, "nextRunAt" = NULL, "finishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      ['SKIPPED', 'Campaign not found.', 'Campaign was removed before sending.', job.id],
    );
    return;
  }

  const contacts = loadCampaignRecipients(campaign, job.userId);
  const appUrl = getBackgroundAppOrigin();
  const startedAt = job.startedAt ? new Date(job.startedAt) : new Date();

  executeSql(
    `
      UPDATE "CampaignSendJob"
      SET
        provider = ?,
        "totalRecipients" = ?,
        "sentCount" = 0,
        "failedCount" = 0,
        "skippedCount" = 0,
        "quotaSkippedCount" = 0,
        "remainingToday" = 0,
        "startedAt" = COALESCE("startedAt", CURRENT_TIMESTAMP),
        "nextRunAt" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP,
        "lastError" = NULL
      WHERE id = ? AND status = 'RUNNING'
    `,
    [campaign.provider, contacts.length, job.id],
  );

  try {
    const result: CampaignSendJobResult = await dispatchCampaignEmails(job.userId, {
      userId: job.userId,
      campaignId: job.campaignId,
      campaignName: campaign.name,
      subject: campaign.subject,
      bodyHtml: campaign.bodyHtml,
      appUrl,
      contacts,
      getControlState: async () => {
        const status = getJobStatus(job.id);
        if (status === 'PAUSED') return 'PAUSED';
        if (status === 'CANCELLED') return 'CANCELLED';
        return 'RUNNING';
      },
    });

    const finalStatus = getCampaignFinalStatus(result);
    const skipReason = finalStatus === 'SKIPPED' ? 'No sendable recipients were available for this job.' : null;

    executeSql(
      `
        UPDATE "CampaignSendJob"
        SET
          status = ?,
          provider = ?,
          "totalRecipients" = ?,
          "sentCount" = ?,
          "failedCount" = ?,
          "skippedCount" = ?,
          "quotaSkippedCount" = ?,
          "remainingToday" = ?,
          "nextRunAt" = NULL,
          "finishedAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP,
          "lastError" = NULL,
          "skipReason" = ?
        WHERE id = ?
      `,
      [
        finalStatus,
        result.provider,
        result.totalRecipients,
        result.sentCount,
        result.failedCount,
        result.skippedCount,
        result.quotaSkippedCount,
        result.remainingToday,
        skipReason,
        job.id,
      ],
    );

    executeSql(
      `
        UPDATE "Campaign"
        SET
          status = ?,
          provider = ?,
          "totalRecipients" = ?,
          "sentCount" = ?,
          "failedCount" = ?,
          "skippedCount" = ?,
          "startedAt" = ?,
          "finishedAt" = CURRENT_TIMESTAMP,
          "durationSeconds" = ?,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ? AND "userId" = ?
      `,
      [
        finalStatus,
        result.provider,
        result.totalRecipients,
        result.sentCount,
        result.failedCount,
        result.skippedCount,
        startedAt.toISOString(),
        Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000)),
        job.campaignId,
        job.userId,
      ],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = isRetryableSendError(error);
    const currentAttempt = Math.max(1, job.attempts);
    const shouldRetry = retryable && currentAttempt < MAX_RETRY_ATTEMPTS;
    const nextRunAt = shouldRetry ? new Date(Date.now() + getRetryDelayMs(currentAttempt)).toISOString() : null;
    const nextStatus = shouldRetry ? 'RETRYING' : 'FAILED';

    executeSql(
      `
        UPDATE "CampaignSendJob"
        SET status = ?, "nextRunAt" = ?, "finishedAt" = ?, "updatedAt" = CURRENT_TIMESTAMP, "lastError" = ?, "skipReason" = ?
        WHERE id = ?
      `,
      [
        nextStatus,
        nextRunAt,
        shouldRetry ? null : new Date().toISOString(),
        message,
        shouldRetry ? null : 'Campaign send failed after retries.',
        job.id,
      ],
    );

    executeSql(
      `
        UPDATE "Campaign"
        SET
          status = ?,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ? AND "userId" = ?
      `,
      [nextStatus, job.campaignId, job.userId],
    );

    if (!shouldRetry) {
      recordSystemEvent({
        level: 'ERROR',
        source: 'campaign_send_queue_job',
        message,
        campaignId: job.campaignId,
        userId: job.userId,
        details: {
          jobId: job.id,
          attempts: currentAttempt,
          status: nextStatus,
          retryable,
        },
      });
      throw error;
    }
  }
}

function recoverStaleRunningCampaignSendJobs() {
  const staleBefore = Date.now() - getStaleRunningMs();
  const runningJobs = queryRows<CampaignSendJobRow>(
    `
      SELECT
        id, "campaignId", "userId", status, attempts, provider,
        "totalRecipients", "sentCount", "failedCount", "skippedCount",
        "quotaSkippedCount", "remainingToday", "requestedAt", "startedAt",
        "nextRunAt", "finishedAt", "lastError", "skipReason", "createdAt", "updatedAt"
      FROM "CampaignSendJob"
      WHERE status = 'RUNNING'
    `,
  );

  for (const job of runningJobs) {
    const lastTouched = Math.max(
      dateValue(job.updatedAt),
      dateValue(job.startedAt),
      dateValue(job.requestedAt),
      dateValue(job.createdAt),
    );
    if (!lastTouched || lastTouched > staleBefore) continue;

    const attempts = Number(job.attempts || 0);
    const nextStatus = attempts >= MAX_RETRY_ATTEMPTS ? 'FAILED' : 'RETRYING';
    const message = `Recovered stale RUNNING send job after ${Math.round(getStaleRunningMs() / 60000)} minutes without progress.`;
    const now = new Date().toISOString();

    executeSql(
      `
        UPDATE "CampaignSendJob"
        SET
          status = ?,
          "nextRunAt" = ?,
          "finishedAt" = ?,
          "updatedAt" = CURRENT_TIMESTAMP,
          "lastError" = ?,
          "skipReason" = ?
        WHERE id = ? AND status = 'RUNNING'
      `,
      [
        nextStatus,
        nextStatus === 'RETRYING' ? now : null,
        nextStatus === 'FAILED' ? now : null,
        message,
        nextStatus === 'FAILED' ? 'Campaign send worker stopped before finishing.' : null,
        job.id,
      ],
    );

    executeSql(
      `
        UPDATE "Campaign"
        SET status = ?, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ? AND "userId" = ? AND status IN ('QUEUED', 'SENDING', 'RETRYING')
      `,
      [nextStatus, job.campaignId, job.userId],
    );

    recordSystemEvent({
      level: nextStatus === 'FAILED' ? 'ERROR' : 'WARN',
      source: 'campaign_send_queue_recovery',
      message,
      campaignId: job.campaignId,
      userId: job.userId,
      details: {
        jobId: job.id,
        attempts,
        status: nextStatus,
      },
    });
  }
}

async function drainCampaignSendQueue() {
  if (workerState.draining) return;
  workerState.draining = true;

  try {
    ensureCampaignSendQueueSchema();
    recoverStaleRunningCampaignSendJobs();

    while (true) {
      const nextJob = queryRow<CampaignSendJobRow>(
        `
          SELECT
                id, "campaignId", "userId", status, attempts, provider,
                "totalRecipients", "sentCount", "failedCount", "skippedCount",
                  "quotaSkippedCount", "remainingToday", "requestedAt", "startedAt",
                "nextRunAt", "finishedAt", "lastError", "skipReason", "createdAt", "updatedAt"
              FROM "CampaignSendJob"
              WHERE status IN ('QUEUED', 'RETRYING')
                AND COALESCE("nextRunAt", "requestedAt") <= ?
              ORDER BY "requestedAt" ASC, "createdAt" ASC
          LIMIT 1
        `,
        [new Date().toISOString()],
      );

      if (!nextJob) break;

      const claimed = executeSql(
        `
          UPDATE "CampaignSendJob"
          SET status = ?, "startedAt" = COALESCE("startedAt", CURRENT_TIMESTAMP), attempts = attempts + 1, "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = ? AND status IN ('QUEUED', 'RETRYING')
        `,
        ['RUNNING', nextJob.id],
      );

      if ((claimed.rowCount ?? claimed.changes ?? 0) !== 1) continue;

      try {
        await processQueuedCampaignSendJob({
          ...nextJob,
          status: 'RUNNING',
          attempts: Number(nextJob.attempts || 0) + 1,
          startedAt: nextJob.startedAt || new Date().toISOString(),
        });
      } catch (error) {
        console.error('campaign_send_queue_job_failed', {
          campaignId: nextJob.campaignId,
          jobId: nextJob.id,
          error: error instanceof Error ? error.message : String(error),
        });
        recordSystemEvent({
          level: 'ERROR',
          source: 'campaign_send_queue_worker',
          message: error instanceof Error ? error.message : 'Queued campaign send failed.',
          campaignId: nextJob.campaignId,
          userId: nextJob.userId,
          details: {
            jobId: nextJob.id,
            attempts: nextJob.attempts,
            status: nextJob.status,
          },
        });
      }
    }
  } finally {
    workerState.draining = false;
  }
}

export function startCampaignSendQueueWorker() {
  ensureCampaignSendQueueSchema();

  if (!workerState.started) {
    workerState.started = true;
    workerState.timer = setInterval(() => {
      void drainCampaignSendQueue();
    }, WORKER_INTERVAL_MS);
    workerState.timer.unref?.();
  }

  void drainCampaignSendQueue();
}
