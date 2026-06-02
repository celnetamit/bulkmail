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
