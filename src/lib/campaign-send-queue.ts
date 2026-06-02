import crypto from 'node:crypto';

import { getCampaignLists } from '@/lib/campaign-lists';
import { dispatchCampaignEmails } from '@/lib/providers/email';
import { executeSql, queryRow, queryRows } from '@/lib/sqlite';

type CampaignRow = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  status: string;
  provider: string | null;
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
  finishedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type CampaignSendJobResult = {
  provider: string;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  totalRecipients: number;
  quotaSkippedCount: number;
  remainingToday: number;
};

const SENDABLE_STATUSES = new Set(['DRAFT', 'SCHEDULED']);
const WORKER_INTERVAL_MS = 1500;

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
      "finishedAt" TEXT,
      "lastError" TEXT,
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CampaignSendJob_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "CampaignSendJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
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
        c.bodyHtml,
        c.status,
        c.provider,
        c.totalRecipients,
        c.sentCount,
        c.failedCount,
        c.skippedCount,
        c.userId,
        c.listId,
        c.templateId
      FROM "Campaign" c
      WHERE c.id = ? AND c.userId = ?
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
      INNER JOIN "List" l ON l.id = c.listId
      WHERE l.id IN (${effectiveListIds.map(() => '?').join(', ')}) AND l.userId = ?
      ORDER BY c.createdAt ASC
    `,
    [...effectiveListIds, userId],
  );
}

export function queueCampaignSendJob(userId: string, campaignId: string) {
  ensureCampaignSendQueueSchema();

  const campaign = loadCampaign(campaignId, userId);
  if (!campaign) {
    throw new Error('Campaign not found.');
  }

  if (!SENDABLE_STATUSES.has(campaign.status)) {
    throw new Error('Only DRAFT or SCHEDULED campaigns can be queued.');
  }

  const activeJob = queryRow<{ id: string; status: string }>(
    `
      SELECT id, status
      FROM "CampaignSendJob"
      WHERE campaignId = ? AND status IN ('QUEUED', 'RUNNING')
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
        id, campaignId, userId, status, attempts, provider,
        totalRecipients, sentCount, failedCount, skippedCount,
        quotaSkippedCount, remainingToday, requestedAt, startedAt,
        finishedAt, lastError, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        totalRecipients = 0,
        sentCount = 0,
        failedCount = 0,
        skippedCount = 0,
        startedAt = NULL,
        finishedAt = NULL,
        durationSeconds = NULL,
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ? AND userId = ?
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

async function processQueuedCampaignSendJob(job: CampaignSendJobRow) {
  const campaign = loadCampaign(job.campaignId, job.userId);
  if (!campaign) {
    executeSql(
      `
        UPDATE "CampaignSendJob"
        SET status = ?, lastError = ?, finishedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      ['FAILED', 'Campaign not found.', job.id],
    );
    return;
  }

  const contacts = loadCampaignRecipients(campaign, job.userId);
  const appUrl = getBackgroundAppOrigin();

  executeSql(
    `
      UPDATE "CampaignSendJob"
      SET
        status = ?,
        attempts = attempts + 1,
        provider = ?,
        totalRecipients = ?,
        sentCount = 0,
        failedCount = 0,
        skippedCount = 0,
        quotaSkippedCount = 0,
        remainingToday = 0,
        startedAt = COALESCE(startedAt, CURRENT_TIMESTAMP),
        updatedAt = CURRENT_TIMESTAMP,
        lastError = NULL
      WHERE id = ? AND status = ?
    `,
    ['RUNNING', campaign.provider, contacts.length, job.id, 'QUEUED'],
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
    });

    executeSql(
      `
        UPDATE "CampaignSendJob"
        SET
          status = ?,
          provider = ?,
          totalRecipients = ?,
          sentCount = ?,
          failedCount = ?,
          skippedCount = ?,
          quotaSkippedCount = ?,
          remainingToday = ?,
          finishedAt = CURRENT_TIMESTAMP,
          updatedAt = CURRENT_TIMESTAMP,
          lastError = NULL
        WHERE id = ?
      `,
      [
        'SUCCEEDED',
        result.provider,
        result.totalRecipients,
        result.sentCount,
        result.failedCount,
        result.skippedCount,
        result.quotaSkippedCount,
        result.remainingToday,
        job.id,
      ],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    executeSql(
      `
        UPDATE "CampaignSendJob"
        SET status = ?, finishedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP, lastError = ?
        WHERE id = ?
      `,
      ['FAILED', message, job.id],
    );
    throw error;
  }
}

async function drainCampaignSendQueue() {
  if (workerState.draining) return;
  workerState.draining = true;

  try {
    ensureCampaignSendQueueSchema();

    while (true) {
      const nextJob = queryRow<CampaignSendJobRow>(
        `
          SELECT
            id, campaignId, userId, status, attempts, provider,
            totalRecipients, sentCount, failedCount, skippedCount,
            quotaSkippedCount, remainingToday, requestedAt, startedAt,
            finishedAt, lastError, createdAt, updatedAt
          FROM "CampaignSendJob"
          WHERE status = 'QUEUED'
          ORDER BY requestedAt ASC, createdAt ASC
          LIMIT 1
        `,
      );

      if (!nextJob) break;

      const claimed = executeSql(
        `
          UPDATE "CampaignSendJob"
          SET status = ?, startedAt = COALESCE(startedAt, CURRENT_TIMESTAMP), attempts = attempts + 1, updatedAt = CURRENT_TIMESTAMP
          WHERE id = ? AND status = ?
        `,
        ['RUNNING', nextJob.id, 'QUEUED'],
      );

      if ((claimed.changes || 0) !== 1) continue;

      try {
        await processQueuedCampaignSendJob(nextJob);
      } catch (error) {
        console.error('campaign_send_queue_job_failed', {
          campaignId: nextJob.campaignId,
          jobId: nextJob.id,
          error: error instanceof Error ? error.message : String(error),
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
