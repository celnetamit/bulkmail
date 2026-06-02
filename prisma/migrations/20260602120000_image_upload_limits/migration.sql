ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "imageUploadLimitKb" INTEGER;

CREATE TABLE IF NOT EXISTS "PlatformSettings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "imageUploadLimitKb" INTEGER NOT NULL DEFAULT 50,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO "PlatformSettings" ("id", "imageUploadLimitKb")
VALUES ('global', 50)
ON CONFLICT ("id") DO NOTHING;
