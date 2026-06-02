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
  "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "startedAt" TIMESTAMPTZ,
  "nextRunAt" TIMESTAMPTZ,
  "finishedAt" TIMESTAMPTZ,
  "lastError" TEXT,
  "skipReason" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "CampaignSendJob_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CampaignSendJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CampaignSendJob_status_requestedAt_idx" ON "CampaignSendJob" ("status", "requestedAt");
CREATE INDEX IF NOT EXISTS "CampaignSendJob_campaignId_idx" ON "CampaignSendJob" ("campaignId");
