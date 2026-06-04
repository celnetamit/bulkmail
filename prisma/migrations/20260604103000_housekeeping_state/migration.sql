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
  "lockExpiresAt" TIMESTAMPTZ,
  "lastStartedAt" TIMESTAMPTZ,
  "lastFinishedAt" TIMESTAMPTZ,
  "lastStatus" TEXT,
  "lastTriggeredBy" TEXT,
  "lastSummaryJson" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
VALUES ('global', TRUE, 720, 90, 30, 30, 30, 180, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
