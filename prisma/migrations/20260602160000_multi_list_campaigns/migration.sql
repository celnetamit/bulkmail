ALTER TABLE "List" ADD COLUMN "isDefaultTestList" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS "CampaignList" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "campaignId" TEXT NOT NULL,
  "listId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "CampaignList_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CampaignList_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CampaignList_campaignId_listId_key" ON "CampaignList" ("campaignId", "listId");
CREATE INDEX IF NOT EXISTS "CampaignList_campaignId_idx" ON "CampaignList" ("campaignId");
CREATE INDEX IF NOT EXISTS "CampaignList_listId_idx" ON "CampaignList" ("listId");

INSERT INTO "CampaignList" ("id", "campaignId", "listId", "createdAt", "updatedAt")
SELECT
  REPLACE(c.id || '_' || c.listId, '-', '') AS id,
  c.id,
  c.listId,
  c.createdAt,
  c.updatedAt
FROM "Campaign" c
WHERE NOT EXISTS (
  SELECT 1
  FROM "CampaignList" cl
  WHERE cl.campaignId = c.id AND cl.listId = c.listId
);
