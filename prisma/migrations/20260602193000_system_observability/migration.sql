CREATE TABLE IF NOT EXISTS "SystemEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "level" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "userId" TEXT,
  "campaignId" TEXT,
  "details" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SystemEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SystemEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SystemEvent_createdAt_idx" ON "SystemEvent" ("createdAt");
CREATE INDEX IF NOT EXISTS "SystemEvent_level_createdAt_idx" ON "SystemEvent" ("level", "createdAt");
CREATE INDEX IF NOT EXISTS "SystemEvent_source_createdAt_idx" ON "SystemEvent" ("source", "createdAt");
