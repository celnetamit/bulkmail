CREATE TABLE IF NOT EXISTS "ResourceMetric" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scopeType" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "userId" TEXT,
  "campaignId" TEXT,
  "cpuUserMs" DOUBLE PRECISION NOT NULL,
  "cpuSystemMs" DOUBLE PRECISION NOT NULL,
  "memoryRssMb" DOUBLE PRECISION NOT NULL,
  "memoryHeapUsedMb" DOUBLE PRECISION NOT NULL,
  "memoryHeapTotalMb" DOUBLE PRECISION NOT NULL,
  "eventLoopUtilization" DOUBLE PRECISION NOT NULL,
  "activeHandles" INTEGER NOT NULL,
  "activeRequests" INTEGER NOT NULL,
  "loadAverage1m" DOUBLE PRECISION NOT NULL,
  "loadAverage5m" DOUBLE PRECISION NOT NULL,
  "loadAverage15m" DOUBLE PRECISION NOT NULL,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "durationMs" INTEGER,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ResourceMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ResourceMetric_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ResourceMetric_createdAt_idx" ON "ResourceMetric" ("createdAt");
CREATE INDEX IF NOT EXISTS "ResourceMetric_scopeType_createdAt_idx" ON "ResourceMetric" ("scopeType", "createdAt");
CREATE INDEX IF NOT EXISTS "ResourceMetric_userId_createdAt_idx" ON "ResourceMetric" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ResourceMetric_campaignId_createdAt_idx" ON "ResourceMetric" ("campaignId", "createdAt");
