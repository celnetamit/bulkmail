ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "campaignSendConcurrency" INTEGER NOT NULL DEFAULT 5;

UPDATE "PlatformSettings"
SET "campaignSendConcurrency" = COALESCE("campaignSendConcurrency", 5)
WHERE "id" = 'global';
