ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "sendingDomain" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "spfVerified" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "dkimVerified" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "dmarcVerified" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "PlatformSettings"
SET
  "sendingDomain" = COALESCE("sendingDomain", NULL),
  "spfVerified" = COALESCE("spfVerified", FALSE),
  "dkimVerified" = COALESCE("dkimVerified", FALSE),
  "dmarcVerified" = COALESCE("dmarcVerified", FALSE)
WHERE "id" = 'global';
