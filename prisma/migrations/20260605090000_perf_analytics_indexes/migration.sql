-- Performance indexes for the busiest dashboard queries.
CREATE INDEX IF NOT EXISTS "List_userId_createdAt_idx" ON "List" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Contact_listId_status_idx" ON "Contact" ("listId", "status");
CREATE INDEX IF NOT EXISTS "Contact_listId_createdAt_idx" ON "Contact" ("listId", "createdAt");
CREATE INDEX IF NOT EXISTS "Campaign_userId_createdAt_idx" ON "Campaign" ("userId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Event_providerEventId_key" ON "Event" ("providerEventId");
CREATE INDEX IF NOT EXISTS "Event_campaignId_createdAt_idx" ON "Event" ("campaignId", "createdAt");
CREATE INDEX IF NOT EXISTS "Event_campaignId_type_idx" ON "Event" ("campaignId", "type");
CREATE INDEX IF NOT EXISTS "SystemEvent_campaignId_createdAt_idx" ON "SystemEvent" ("campaignId", "createdAt");
CREATE INDEX IF NOT EXISTS "CampaignSendJob_campaignId_createdAt_idx" ON "CampaignSendJob" ("campaignId", "createdAt");
