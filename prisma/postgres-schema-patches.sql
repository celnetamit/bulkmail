-- Idempotent patches for existing Postgres databases that were initialized
-- before the current schema snapshot in postgres-init.sql.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'USER';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dailyEmailLimit" INTEGER NOT NULL DEFAULT 100000;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "imageUploadLimitKb" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMPTZ;

ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "templateId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "totalRecipients" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "sentCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "failedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "skippedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMPTZ;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "finishedAt" TIMESTAMPTZ;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "durationSeconds" INTEGER;

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "providerEventId" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT;

ALTER TABLE "List" ADD COLUMN IF NOT EXISTS "isDefaultTestList" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS "MailSettings_userId_key" ON "MailSettings" ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Event_providerEventId_key" ON "Event" ("providerEventId");

INSERT INTO "CampaignList" ("id", "campaignId", "listId", "createdAt", "updatedAt")
SELECT
  REPLACE(c."id" || '_' || c."listId", '-', '') AS "id",
  c."id",
  c."listId",
  COALESCE(c."createdAt", NOW()),
  COALESCE(c."updatedAt", NOW())
FROM "Campaign" c
WHERE c."listId" IS NOT NULL
ON CONFLICT DO NOTHING;
