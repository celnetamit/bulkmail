CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "password" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'USER',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "dailyEmailLimit" INTEGER NOT NULL DEFAULT 100000,
  "imageUploadLimitKb" INTEGER,
  "lastLoginAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User" ("email");

CREATE TABLE IF NOT EXISTS "Team" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "dailyCreditLimit" INTEGER NOT NULL DEFAULT 100000,
  "managerId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Team_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Team_managerId_idx" ON "Team" ("managerId");

CREATE TABLE IF NOT EXISTS "TeamMember" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL UNIQUE,
  "allocatedDailyLimit" INTEGER NOT NULL DEFAULT 100000,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TeamMember_teamId_idx" ON "TeamMember" ("teamId");

CREATE TABLE IF NOT EXISTS "PlatformSettings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "imageUploadLimitKb" INTEGER NOT NULL DEFAULT 50,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO "PlatformSettings" ("id", "imageUploadLimitKb")
VALUES ('global', 50)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "MailSettings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "provider" TEXT NOT NULL DEFAULT 'mock',
  "awsRegion" TEXT,
  "awsFromEmail" TEXT,
  "awsAccessKeyIdEncrypted" TEXT,
  "awsSecretAccessKeyEncrypted" TEXT,
  "awsSessionTokenEncrypted" TEXT,
  "resendApiKeyEncrypted" TEXT,
  "resendFromEmail" TEXT,
  "webhookSharedSecretEncrypted" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "MailSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Template" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "bodyHtml" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Template_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "List" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "userId" TEXT NOT NULL,
  "isDefaultTestList" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "List_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Contact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "firstName" TEXT,
  "lastName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SUBSCRIBED',
  "listId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Contact_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Contact_email_listId_key" ON "Contact" ("email", "listId");

CREATE TABLE IF NOT EXISTS "Campaign" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "bodyHtml" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "provider" TEXT,
  "totalRecipients" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMPTZ,
  "finishedAt" TIMESTAMPTZ,
  "durationSeconds" INTEGER,
  "userId" TEXT NOT NULL,
  "listId" TEXT NOT NULL,
  "templateId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Campaign_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Campaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

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

CREATE TABLE IF NOT EXISTS "Event" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "provider" TEXT,
  "providerEventId" TEXT,
  "providerMessageId" TEXT,
  "contactId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Event_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Event_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Event_providerEventId_key" ON "Event" ("providerEventId");

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

CREATE TABLE IF NOT EXISTS "AiAgentProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "agentKey" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'openrouter',
  "model" TEXT NOT NULL,
  "baseUrl" TEXT,
  "apiKeyEncrypted" TEXT,
  "systemPrompt" TEXT NOT NULL,
  "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
  "maxOutputTokens" INTEGER NOT NULL DEFAULT 1200,
  "isEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AgentConversation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "agentKey" TEXT NOT NULL,
  "title" TEXT,
  "userId" TEXT NOT NULL,
  "lastMessageAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "AgentConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AgentConversation_userId_agentKey_updatedAt_idx" ON "AgentConversation" ("userId", "agentKey", "updatedAt");

CREATE TABLE IF NOT EXISTS "AgentMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "AgentMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AgentMessage_conversationId_createdAt_idx" ON "AgentMessage" ("conversationId", "createdAt");
