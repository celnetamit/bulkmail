import { randomUUID } from 'node:crypto';

import { recordAuditEvent } from '@/lib/audit';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { dispatchCampaignEmails, sendTestEmail } from '@/lib/providers/email';
import { recordResourceMetric, getResourceAnalyticsSummary } from '@/lib/resource-analytics';
import { executeSql, queryRow, queryRows } from '@/lib/sqlite';

export type AiProvider = 'openrouter' | 'openai' | 'anthropic' | 'gemini';
export type AiAgentKey = 'debugger' | 'support' | 'worker';

export type AgentRole = 'ADMIN' | 'MANAGER' | 'USER';

type StoredAiAgentProfile = {
  agentKey: string;
  label: string;
  description: string | null;
  provider: string;
  model: string;
  baseUrl: string | null;
  apiKeyEncrypted: string | null;
  systemPrompt: string;
  temperature: number;
  maxOutputTokens: number;
  isEnabled: number | boolean;
  createdAt: string;
  updatedAt: string;
};

export type AiAgentProfileView = {
  agentKey: AiAgentKey;
  label: string;
  description: string;
  provider: AiProvider;
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
  systemPrompt: string;
  temperature: number;
  maxOutputTokens: number;
  isEnabled: boolean;
  source: 'database' | 'env';
};

export type AiAgentProfileInput = {
  agentKey: AiAgentKey;
  label?: string;
  description?: string | null;
  provider?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string | null;
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
  isEnabled?: boolean;
};

type AgentConversationRow = {
  id: string;
  agentKey: string;
  title: string | null;
  userId: string;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AgentMessageRow = {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  metadataJson: string | null;
  createdAt: string;
};

export type AgentMessageView = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type AgentConversationView = {
  id: string;
  agentKey: AiAgentKey;
  title: string;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessageView[];
};

export type AgentChatRequest = {
  agentKey: AiAgentKey;
  message: string;
  conversationId?: string | null;
  executeActions?: boolean;
};

export type AgentAction =
  | { type: 'create_list'; name: string; description?: string | null }
  | { type: 'update_list'; listId: string; name?: string | null; description?: string | null }
  | { type: 'delete_list'; listId: string }
  | { type: 'create_template'; name: string; subject: string; bodyHtml: string }
  | { type: 'update_template'; templateId: string; name?: string | null; subject?: string | null; bodyHtml?: string | null }
  | { type: 'delete_template'; templateId: string }
  | { type: 'create_campaign'; name: string; subject: string; bodyHtml: string; listId: string; templateId?: string | null }
  | { type: 'update_campaign'; campaignId: string; name?: string | null; subject?: string | null; bodyHtml?: string | null; listId?: string | null; templateId?: string | null; status?: string | null }
  | { type: 'delete_campaign'; campaignId: string }
  | { type: 'add_contact'; listId: string; email: string; firstName?: string | null; lastName?: string | null }
  | { type: 'update_contact'; contactId: string; email?: string | null; firstName?: string | null; lastName?: string | null; status?: string | null }
  | { type: 'delete_contact'; contactId: string }
  | { type: 'send_campaign'; campaignId: string }
  | { type: 'send_test_email'; toEmail: string; subject: string; bodyHtml: string };

export type AgentChatResult = {
  conversation: AgentConversationView;
  reply: string;
  actions: AgentAction[];
  executed?: Array<{ type: string; result: string }>;
};

export type EmailComposerMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type EmailComposerInput = {
  surface: 'campaign' | 'template';
  prompt: string;
  subject?: string;
  bodyHtml?: string;
  draftName?: string;
  linkedTemplateName?: string | null;
  listNames?: string[];
  history?: EmailComposerMessage[];
};

export type EmailComposerResult = {
  reply: string;
  subject: string;
  bodyHtml: string;
  provider: AiProvider;
  model: string;
};

type NormalizedCompletion = {
  reply: string;
  actions: AgentAction[];
};

type NormalizedEmailComposerResult = {
  reply: string;
  subject: string;
  bodyHtml: string;
};

const DEFAULT_AI_PROVIDER: AiProvider = 'openrouter';
const DEFAULT_BASE_URLS: Record<AiProvider, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com',
};

const DEFAULT_MODELS: Record<AiAgentKey, string> = {
  debugger: process.env.AI_DEBUGGER_MODEL || process.env.AI_MODEL || 'openai/gpt-4o-mini',
  support: process.env.AI_SUPPORT_MODEL || process.env.AI_MODEL || 'openai/gpt-4o-mini',
  worker: process.env.AI_WORKER_MODEL || process.env.AI_MODEL || 'openai/gpt-4o-mini',
};

const DEFAULT_LABELS: Record<AiAgentKey, string> = {
  debugger: 'Agent 1 - Debugger',
  support: 'Agent 2 - Support',
  worker: 'Agent 3 - Worker',
};

const DEFAULT_DESCRIPTIONS: Record<AiAgentKey, string> = {
  debugger: 'Full-stack debugger that summarizes errors, failures, and platform pressure.',
  support: 'Guided support assistant that helps users step through the platform.',
  worker: 'Task executor that can perform allowed actions on behalf of the logged-in user.',
};

function defaultSystemPrompt(agentKey: AiAgentKey) {
  if (agentKey === 'debugger') {
    return [
      'You are Agent 1, the platform debugger for MailFlow.',
      'Your job is to summarize current errors, likely causes, failing areas, recent campaign issues, and actionable next steps.',
      'Use the supplied context only. Be practical and concise.',
      'Return JSON with keys: reply, actions.',
      'The actions array should always be empty for this agent.',
    ].join(' ');
  }

  if (agentKey === 'worker') {
    return [
      'You are Agent 3, a trusted platform worker who acts on behalf of the logged-in user.',
      'You may only operate on that user’s own data unless the user is an admin or manager with broader rights.',
      'When given an instruction, reply in JSON with keys: reply and actions.',
      'The reply should explain what you intend to do in plain language.',
      'The actions array must contain only supported actions with the exact shape requested by the platform.',
      'Do not invent unsupported action types. Do not act outside the supplied context.',
    ].join(' ');
  }

  return [
    'You are Agent 2, the support assistant for MailFlow.',
    'Help the user step by step with calm, practical guidance.',
    'Use the supplied context and platform knowledge.',
    'Return JSON with keys: reply and actions.',
    'The actions array should always be empty for this agent.',
  ].join(' ');
}

let aiSchemaInitialized = false;

function isDuplicateColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /duplicate column name|already exists/i.test(message);
}

function normalizeProvider(value: string | null | undefined): AiProvider {
  const provider = String(value || DEFAULT_AI_PROVIDER).trim().toLowerCase();
  if (provider === 'openai' || provider === 'anthropic' || provider === 'gemini') return provider;
  return 'openrouter';
}

function normalizeAgentKey(value: string | null | undefined): AiAgentKey {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'debugger' || key === 'support' || key === 'worker') return key;
  return 'support';
}

function getEnvApiKey(provider: AiProvider) {
  if (provider === 'openrouter') return process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || '';
  if (provider === 'openai') return process.env.OPENAI_API_KEY || process.env.AI_API_KEY || '';
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY || '';
  if (provider === 'gemini') return process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '';
  return '';
}

function getEnvBaseUrl(provider: AiProvider) {
  if (provider === 'openrouter') return process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URLS.openrouter;
  if (provider === 'openai') return process.env.OPENAI_BASE_URL || DEFAULT_BASE_URLS.openai;
  if (provider === 'anthropic') return process.env.ANTHROPIC_BASE_URL || DEFAULT_BASE_URLS.anthropic;
  if (provider === 'gemini') return process.env.GEMINI_BASE_URL || DEFAULT_BASE_URLS.gemini;
  return DEFAULT_BASE_URLS.openrouter;
}

function getEnvModel(agentKey: AiAgentKey) {
  return DEFAULT_MODELS[agentKey];
}

function getDefaultProfile(agentKey: AiAgentKey) {
  return {
    agentKey,
    label: DEFAULT_LABELS[agentKey],
    description: DEFAULT_DESCRIPTIONS[agentKey],
    provider: DEFAULT_AI_PROVIDER,
    model: getEnvModel(agentKey),
    baseUrl: getEnvBaseUrl(DEFAULT_AI_PROVIDER),
    hasApiKey: Boolean(getEnvApiKey(DEFAULT_AI_PROVIDER)),
    systemPrompt: defaultSystemPrompt(agentKey),
    temperature: agentKey === 'worker' ? 0.2 : 0.35,
    maxOutputTokens: agentKey === 'debugger' ? 1600 : 1200,
    isEnabled: true,
    source: 'env' as const,
  };
}

export function ensureAiAgentsSchema() {
  if (aiSchemaInitialized) return;

  executeSql(`
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
      "temperature" REAL NOT NULL DEFAULT 0.4,
      "maxOutputTokens" INTEGER NOT NULL DEFAULT 1200,
      "isEnabled" INTEGER NOT NULL DEFAULT 1,
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  executeSql(`
    CREATE TABLE IF NOT EXISTS "AgentConversation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "agentKey" TEXT NOT NULL,
      "title" TEXT,
      "userId" TEXT NOT NULL,
      "lastMessageAt" TEXT,
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AgentConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  executeSql('CREATE INDEX IF NOT EXISTS "AgentConversation_userId_agentKey_updatedAt_idx" ON "AgentConversation" ("userId", "agentKey", "updatedAt")');

  executeSql(`
    CREATE TABLE IF NOT EXISTS "AgentMessage" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "conversationId" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "metadataJson" TEXT,
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AgentMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  executeSql('CREATE INDEX IF NOT EXISTS "AgentMessage_conversationId_createdAt_idx" ON "AgentMessage" ("conversationId", "createdAt")');

  for (const profile of [getDefaultProfile('debugger'), getDefaultProfile('support'), getDefaultProfile('worker')]) {
    executeSql(
      `
        INSERT INTO "AiAgentProfile" (
          "id", "agentKey", "label", "description", "provider", "model", "baseUrl",
          "apiKeyEncrypted", "systemPrompt", "temperature", "maxOutputTokens", "isEnabled",
          "createdAt", "updatedAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT("agentKey") DO NOTHING
      `,
      [
        randomUUID(),
        profile.agentKey,
        profile.label,
        profile.description,
        profile.provider,
        profile.model,
        profile.baseUrl,
        null,
        profile.systemPrompt,
        profile.temperature,
        profile.maxOutputTokens,
        1,
      ],
    );
  }

  aiSchemaInitialized = true;
}

function toProfileView(row: StoredAiAgentProfile | null, agentKey: AiAgentKey): AiAgentProfileView {
  if (!row) {
    const fallback = getDefaultProfile(agentKey);
    return fallback;
  }

  return {
    agentKey: normalizeAgentKey(row.agentKey),
    label: row.label,
    description: row.description || '',
    provider: normalizeProvider(row.provider),
    model: row.model,
    baseUrl: row.baseUrl || '',
    hasApiKey: Boolean(row.apiKeyEncrypted),
    systemPrompt: row.systemPrompt,
    temperature: Number(row.temperature || 0.4),
    maxOutputTokens: Number(row.maxOutputTokens || 1200),
    isEnabled: Boolean(row.isEnabled),
    source: 'database',
  };
}

export async function getAiAgentProfiles(): Promise<AiAgentProfileView[]> {
  ensureAiAgentsSchema();

  const rows = queryRows<StoredAiAgentProfile>(
    `
      SELECT
        "agentKey",
        label,
        description,
        provider,
        model,
        "baseUrl",
        "apiKeyEncrypted",
        "systemPrompt",
        "temperature",
        "maxOutputTokens",
        "isEnabled",
        "createdAt",
        "updatedAt"
      FROM "AiAgentProfile"
      ORDER BY "agentKey" ASC
    `,
  );

  const byKey = new Map(rows.map((row) => [normalizeAgentKey(row.agentKey), row]));
  return (['debugger', 'support', 'worker'] as AiAgentKey[]).map((agentKey) => toProfileView(byKey.get(agentKey) || null, agentKey));
}

export async function saveAiAgentProfiles(
  profiles: AiAgentProfileInput[],
) {
  ensureAiAgentsSchema();

  for (const profile of profiles) {
    const current = queryRow<StoredAiAgentProfile>(
      'SELECT "agentKey", label, description, provider, model, "baseUrl", "apiKeyEncrypted", "systemPrompt", "temperature", "maxOutputTokens", "isEnabled", "createdAt", "updatedAt" FROM "AiAgentProfile" WHERE "agentKey" = ? LIMIT 1',
      [profile.agentKey],
    );

    const merged = {
      agentKey: profile.agentKey,
      label: String(profile.label || current?.label || DEFAULT_LABELS[profile.agentKey]).trim(),
      description: profile.description === undefined ? current?.description || DEFAULT_DESCRIPTIONS[profile.agentKey] : String(profile.description || '').trim(),
      provider: normalizeProvider(String(profile.provider || current?.provider || DEFAULT_AI_PROVIDER)),
      model: String(profile.model || current?.model || getEnvModel(profile.agentKey)).trim(),
      baseUrl: String(profile.baseUrl || current?.baseUrl || getEnvBaseUrl(normalizeProvider(String(profile.provider || current?.provider || DEFAULT_AI_PROVIDER)))).trim() || null,
      apiKeyEncrypted:
        profile.apiKey !== undefined
          ? (profile.apiKey && profile.apiKey.trim() ? encryptSecret(profile.apiKey) : null)
          : current?.apiKeyEncrypted || null,
      systemPrompt: String(profile.systemPrompt || current?.systemPrompt || defaultSystemPrompt(profile.agentKey)).trim(),
      temperature: Number.isFinite(Number(profile.temperature)) ? Number(profile.temperature) : Number(current?.temperature || 0.4),
      maxOutputTokens: Number.isFinite(Number(profile.maxOutputTokens)) ? Math.floor(Number(profile.maxOutputTokens)) : Number(current?.maxOutputTokens || 1200),
      isEnabled: profile.isEnabled === undefined ? Boolean(current?.isEnabled) : Boolean(profile.isEnabled),
    };

    if (current) {
      executeSql(
        `
          UPDATE "AiAgentProfile"
          SET
            "label" = ?,
            "description" = ?,
            "provider" = ?,
            "model" = ?,
            "baseUrl" = ?,
            "apiKeyEncrypted" = ?,
            "systemPrompt" = ?,
            "temperature" = ?,
            "maxOutputTokens" = ?,
            "isEnabled" = ?,
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "agentKey" = ?
        `,
        [
          merged.label,
          merged.description,
          merged.provider,
          merged.model,
          merged.baseUrl,
          merged.apiKeyEncrypted,
          merged.systemPrompt,
          merged.temperature,
          merged.maxOutputTokens,
          merged.isEnabled ? 1 : 0,
          merged.agentKey,
        ],
      );
    } else {
      executeSql(
        `
          INSERT INTO "AiAgentProfile" (
            "id", "agentKey", "label", "description", "provider", "model", "baseUrl",
            "apiKeyEncrypted", "systemPrompt", "temperature", "maxOutputTokens", "isEnabled",
            "createdAt", "updatedAt"
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
        [
          randomUUID(),
          merged.agentKey,
          merged.label,
          merged.description,
          merged.provider,
          merged.model,
          merged.baseUrl,
          merged.apiKeyEncrypted,
          merged.systemPrompt,
          merged.temperature,
          merged.maxOutputTokens,
          merged.isEnabled ? 1 : 0,
        ],
      );
    }
  }
}

export async function resolveAiAgentProfile(agentKey: AiAgentKey): Promise<AiAgentProfileView> {
  ensureAiAgentsSchema();
  const row = queryRow<StoredAiAgentProfile>(
    `
      SELECT
        "agentKey",
        label,
        description,
        provider,
        model,
        "baseUrl",
        "apiKeyEncrypted",
        "systemPrompt",
        "temperature",
        "maxOutputTokens",
        "isEnabled",
        "createdAt",
        "updatedAt"
      FROM "AiAgentProfile"
      WHERE "agentKey" = ?
      LIMIT 1
    `,
    [agentKey],
  );

  const view = toProfileView(row, agentKey);
  if (!row) return view;

  if (!view.hasApiKey) {
    const envKey = getEnvApiKey(view.provider);
    if (envKey) {
      return {
        ...view,
        hasApiKey: true,
      };
    }
  }

  return view;
}

export function getAiAgentApiKey(profile: AiAgentProfileView, storedEncrypted: string | null) {
  if (storedEncrypted) {
    try {
      return decryptSecret(storedEncrypted) || '';
    } catch {
      return '';
    }
  }

  return getEnvApiKey(profile.provider);
}

export async function listAgentConversations(userId: string, agentKey: AiAgentKey) {
  ensureAiAgentsSchema();
  return queryRows<AgentConversationRow>(
    `
      SELECT id, "agentKey", title, "userId", "lastMessageAt", "createdAt", "updatedAt"
      FROM "AgentConversation"
      WHERE "userId" = ? AND "agentKey" = ?
      ORDER BY COALESCE("lastMessageAt", "createdAt") DESC
      LIMIT 20
    `,
    [userId, agentKey],
  );
}

export async function getAgentConversation(conversationId: string, userId: string) {
  ensureAiAgentsSchema();
  const conversation = queryRow<AgentConversationRow>(
    `
      SELECT id, "agentKey", title, "userId", "lastMessageAt", "createdAt", "updatedAt"
      FROM "AgentConversation"
      WHERE id = ? AND "userId" = ?
      LIMIT 1
    `,
    [conversationId, userId],
  );

  if (!conversation) return null;

  const messages = queryRows<AgentMessageRow>(
    `
      SELECT id, "conversationId", role, content, "metadataJson", "createdAt"
      FROM "AgentMessage"
      WHERE "conversationId" = ?
      ORDER BY "createdAt" ASC
    `,
    [conversationId],
  );

  return {
    id: conversation.id,
    agentKey: normalizeAgentKey(conversation.agentKey),
    title: conversation.title || 'Conversation',
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: messages.map((message) => ({
      id: message.id,
      role: normalizeMessageRole(message.role),
      content: message.content,
      metadata: message.metadataJson ? safeJsonParse(message.metadataJson) : null,
      createdAt: message.createdAt,
    })),
  } satisfies AgentConversationView;
}

export async function createAgentConversation(userId: string, agentKey: AiAgentKey, title: string) {
  ensureAiAgentsSchema();
  const id = randomUUID().replace(/-/g, '');
  executeSql(
    `
      INSERT INTO "AgentConversation" (
        "id", "agentKey", "title", "userId", "lastMessageAt", "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [id, agentKey, title, userId],
  );

  return id;
}

export async function appendAgentMessage(
  conversationId: string,
  input: { role: 'user' | 'assistant' | 'system'; content: string; metadata?: Record<string, unknown> | null },
) {
  ensureAiAgentsSchema();
  const id = randomUUID().replace(/-/g, '');
  executeSql(
    `
      INSERT INTO "AgentMessage" (
        "id", "conversationId", "role", "content", "metadataJson", "createdAt"
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [id, conversationId, input.role, input.content, input.metadata ? JSON.stringify(input.metadata) : null],
  );

  executeSql(
    'UPDATE "AgentConversation" SET "lastMessageAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?',
    [conversationId],
  );

  return id;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return { raw: value };
  }
}

function normalizeMessageRole(role: string) {
  if (role === 'assistant' || role === 'user' || role === 'system') return role;
  return 'assistant';
}

function buildRolePrompt(agentKey: AiAgentKey, profile: AiAgentProfileView) {
  if (profile.systemPrompt.trim()) return profile.systemPrompt.trim();
  return defaultSystemPrompt(agentKey);
}

function buildHelpContext() {
  return [
    'Relevant product paths:',
    '- /dashboard/lists for list browsing',
    '- /dashboard/lists/[id] for contact management',
    '- /dashboard/templates and /dashboard/templates/create',
    '- /dashboard/campaigns and /dashboard/campaigns/create',
    '- /dashboard/media-library for uploaded images',
    '- /dashboard/analytics for campaign performance',
    '- /dashboard/resources for runtime and send pressure',
    '- /dashboard/settings for provider configuration',
    'Core guidance: create a list first, then a template, then a campaign.',
  ].join('\n');
}

async function buildDebuggerContext(userId: string, role: AgentRole) {
  const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const analytics = await getResourceAnalyticsSummary(userId, role, sevenDaysAgo, null);
  const failedCampaigns = queryRows<{
    id: string;
    name: string;
    subject: string;
    status: string;
    failedCount: number;
    sentCount: number;
    skippedCount: number;
    startedAt: string | null;
    finishedAt: string | null;
    durationSeconds: number | null;
    listName: string;
    ownerEmail: string;
  }>(
    `
      SELECT
        c.id,
        c.name,
        c.subject,
        c.status,
        c."failedCount",
        c."sentCount",
        c."skippedCount",
        c."startedAt",
        c."finishedAt",
        c."durationSeconds",
        l.name as listName,
        u.email as ownerEmail
      FROM "Campaign" c
      INNER JOIN "List" l ON l.id = c."listId"
      INNER JOIN "User" u ON u.id = c."userId"
      WHERE c.status = 'FAILED' OR c."failedCount" > 0
      ORDER BY COALESCE(c."finishedAt", c."updatedAt") DESC
      LIMIT 10
    `,
  );

  return JSON.stringify({
    scope: 'debugger',
    resourceAnalytics: analytics.totals,
    dailyPeaks: analytics.dailyPeaks.slice(-7),
    failedCampaigns,
  }, null, 2);
}

async function buildSupportContext() {
  return [
    buildHelpContext(),
    'When answering, use short steps and point users to the exact dashboard page they should open next.',
  ].join('\n\n');
}

async function buildWorkerContext(userId: string) {
  const lists = queryRows<{ id: string; name: string; description: string | null; contacts: number; campaigns: number }>(
    `
      SELECT
        l.id,
        l.name,
        l.description,
        (SELECT COUNT(*) FROM "Contact" c WHERE c."listId" = l.id) as contacts,
        (SELECT COUNT(*) FROM "Campaign" c WHERE c."listId" = l.id) as campaigns
      FROM "List" l
      WHERE l."userId" = ?
      ORDER BY l."createdAt" DESC
      LIMIT 10
    `,
    [userId],
  );

  const templates = queryRows<{ id: string; name: string; subject: string }>(
    `
      SELECT id, name, subject
      FROM "Template"
      WHERE "userId" = ?
      ORDER BY "createdAt" DESC
      LIMIT 10
    `,
    [userId],
  );

  const campaigns = queryRows<{ id: string; name: string; subject: string; status: string; listName: string }>(
    `
      SELECT c.id, c.name, c.subject, c.status, l.name as listName
      FROM "Campaign" c
      INNER JOIN "List" l ON l.id = c."listId"
      WHERE c."userId" = ?
      ORDER BY c."createdAt" DESC
      LIMIT 10
    `,
    [userId],
  );

  return JSON.stringify({ lists, templates, campaigns }, null, 2);
}

async function buildAgentContext(agentKey: AiAgentKey, userId: string, role: AgentRole) {
  if (agentKey === 'debugger') return buildDebuggerContext(userId, role);
  if (agentKey === 'worker') return buildWorkerContext(userId);
  return buildSupportContext();
}

function getOpenRouterHeaders(model: string, apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.APP_URL || process.env.PUBLIC_APP_URL || 'http://localhost:3000',
    'X-Title': 'MailFlow',
    'X-Model': model,
  };
}

async function callProvider(profile: AiAgentProfileView, apiKey: string, messages: Array<{ role: string; content: string }>) {
  const baseUrl = (profile.baseUrl || getEnvBaseUrl(profile.provider)).replace(/\/$/, '');

  if (!apiKey) {
    throw new Error(`No API key configured for ${profile.label}. Configure it in Admin > AI Agents.`);
  }

  if (profile.provider === 'anthropic') {
    const anthropicMessages = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content,
      }));
    const system = messages.find((message) => message.role === 'system')?.content || '';

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: profile.model,
        max_tokens: profile.maxOutputTokens,
        temperature: profile.temperature,
        system,
        messages: anthropicMessages,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic request failed: ${response.status} ${text}`);
    }

    const data = await response.json() as { content?: Array<{ text?: string }> };
    return data.content?.map((part) => part.text || '').join('').trim() || '';
  }

  if (profile.provider === 'gemini') {
    const contents = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      }));
    const system = messages.find((message) => message.role === 'system')?.content || '';

    const response = await fetch(`${baseUrl}/v1beta/models/${encodeURIComponent(profile.model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: profile.temperature, maxOutputTokens: profile.maxOutputTokens },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini request failed: ${response.status} ${text}`);
    }

    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || '';
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: getOpenRouterHeaders(profile.model, apiKey),
    body: JSON.stringify({
      model: profile.model,
      temperature: profile.temperature,
      max_tokens: profile.maxOutputTokens,
      messages,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI-compatible request failed: ${response.status} ${text}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() || '';
}

function normalizeCompletion(raw: string, agentKey: AiAgentKey): NormalizedCompletion {
  const fallbackReply = raw.trim() || 'No response was returned.';

  try {
    const parsed = JSON.parse(raw) as { reply?: unknown; actions?: unknown };
    const reply = typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : fallbackReply;
    const actions = Array.isArray(parsed.actions) ? parsed.actions.filter(Boolean) as AgentAction[] : [];
    return {
      reply,
      actions: agentKey === 'worker' ? actions : [],
    };
  } catch {
    return { reply: fallbackReply, actions: [] };
  }
}

function stripJsonCodeFence(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function normalizeEmailComposerResult(raw: string, fallbackSubject: string, fallbackBodyHtml: string): NormalizedEmailComposerResult {
  const cleaned = stripJsonCodeFence(raw);
  const fallbackReply = cleaned || 'Draft updated.';

  try {
    const parsed = JSON.parse(cleaned) as { reply?: unknown; subject?: unknown; bodyHtml?: unknown };
    const reply = typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : fallbackReply;
    const subject = typeof parsed.subject === 'string' && parsed.subject.trim() ? parsed.subject.trim() : fallbackSubject;
    const bodyHtml = typeof parsed.bodyHtml === 'string' && parsed.bodyHtml.trim() ? parsed.bodyHtml.trim() : fallbackBodyHtml;
    return { reply, subject, bodyHtml };
  } catch {
    return {
      reply: fallbackReply,
      subject: fallbackSubject,
      bodyHtml: fallbackBodyHtml,
    };
  }
}

function getStoredProfileRow(agentKey: AiAgentKey) {
  return queryRow<StoredAiAgentProfile>(
    `
      SELECT
        "agentKey",
        label,
        description,
        provider,
        model,
        "baseUrl",
        "apiKeyEncrypted",
        "systemPrompt",
        "temperature",
        "maxOutputTokens",
        "isEnabled",
        "createdAt",
        "updatedAt"
      FROM "AiAgentProfile"
      WHERE "agentKey" = ?
      LIMIT 1
    `,
    [agentKey],
  );
}

function buildEmailComposerPrompt(input: EmailComposerInput) {
  const context = [
    `Surface: ${input.surface}`,
    input.draftName ? `Draft name: ${input.draftName}` : null,
    input.linkedTemplateName ? `Linked template: ${input.linkedTemplateName}` : null,
    input.listNames?.length ? `Selected lists: ${input.listNames.join(', ')}` : null,
    `Current subject:\n${input.subject?.trim() || '(empty)'}`,
    `Current body HTML:\n${input.bodyHtml?.trim() || '(empty)'}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return [
    {
      role: 'system',
      content: [
        'You are MailFlow AI Magic, an email writing assistant inside the campaign and template editor.',
        'Help the user create or refine email copy while keeping the result production-ready for HTML email sending.',
        'Return strict JSON only with keys: reply, subject, bodyHtml.',
        'The reply must be concise, helpful, and mention the main improvement you made.',
        'The subject must be plain text only.',
        'The bodyHtml must be complete email HTML suitable for direct editing in MailFlow.',
        'Prefer clean table-based email markup with inline styles.',
        'When appropriate, preserve or introduce personalization placeholders such as {{firstName}}.',
        'Include an unsubscribe link using {{unsubscribeUrl}} in the footer when you create or significantly revise the email.',
        'Never wrap the JSON in markdown fences.',
      ].join(' '),
    },
    {
      role: 'system',
      content: context,
    },
    ...(input.history || []).slice(-8).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    {
      role: 'user',
      content: input.prompt.trim(),
    },
  ] as Array<{ role: string; content: string }>;
}

export async function runEmailComposer(
  user: { userId: string; email: string; role: AgentRole },
  input: EmailComposerInput,
): Promise<EmailComposerResult> {
  ensureAiAgentsSchema();

  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new Error('Prompt is required.');
  }

  const profile = await resolveAiAgentProfile('support');
  if (!profile.isEnabled) {
    throw new Error(`${profile.label} is currently disabled.`);
  }

  const profileRow = getStoredProfileRow('support');
  const apiKey = getAiAgentApiKey(profile, profileRow?.apiKeyEncrypted || null);
  const messages = buildEmailComposerPrompt(input);
  const rawReply = await callProvider(profile, apiKey, messages);
  const normalized = normalizeEmailComposerResult(rawReply, input.subject?.trim() || '', input.bodyHtml?.trim() || '');

  await recordAuditEvent({
    actorUserId: user.userId,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'ai_email_composer',
    entityType: input.surface === 'campaign' ? 'Campaign' : 'Template',
    entityId: input.draftName || user.userId,
    scopeType: 'SELF',
    metadata: {
      surface: input.surface,
      provider: profile.provider,
      model: profile.model,
      promptLength: prompt.length,
      listCount: input.listNames?.length || 0,
    },
  });

  return {
    reply: normalized.reply,
    subject: normalized.subject,
    bodyHtml: normalized.bodyHtml,
    provider: profile.provider,
    model: profile.model,
  };
}

async function createEntityFromAction(
  actor: { userId: string; email: string; role: AgentRole },
  action: AgentAction,
) {
  const now = new Date().toISOString();
  switch (action.type) {
    case 'create_list': {
      const id = randomUUID().replace(/-/g, '');
      executeSql(
        `
          INSERT INTO "List" ("id", "name", "description", "userId", "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [id, action.name.trim(), action.description || null, actor.userId, now, now],
      );
      await recordAuditEvent({
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'agent_create_list',
        entityType: 'List',
        entityId: id,
        scopeType: 'SELF',
        metadata: { name: action.name, description: action.description || null, agent: 'worker' },
      });
      return `Created list "${action.name}".`;
    }
    case 'update_list': {
      const existing = queryRow<{ id: string }>('SELECT id FROM "List" WHERE id = ? AND "userId" = ? LIMIT 1', [action.listId, actor.userId]);
      if (!existing) return `List ${action.listId} was not found or is not owned by the user.`;
      const assignments: string[] = [];
      const params: unknown[] = [];
      const changedFields: string[] = [];
      if (action.name !== undefined) {
        assignments.push('"name" = ?');
        params.push(action.name?.trim() || null);
        changedFields.push('name');
      }
      if (action.description !== undefined) {
        assignments.push('"description" = ?');
        params.push(action.description || null);
        changedFields.push('description');
      }
      if (!assignments.length) return `No list changes were requested.`;
      executeSql(`UPDATE "List" SET ${assignments.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ? AND "userId" = ?`, [...params, action.listId, actor.userId]);
      await recordAuditEvent({
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'agent_update_list',
        entityType: 'List',
        entityId: action.listId,
        scopeType: 'SELF',
        metadata: { changedFields, agent: 'worker' },
      });
      return `Updated list ${action.listId}.`;
    }
    case 'delete_list': {
      executeSql('DELETE FROM "List" WHERE id = ? AND "userId" = ?', [action.listId, actor.userId]);
      await recordAuditEvent({
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'agent_delete_list',
        entityType: 'List',
        entityId: action.listId,
        scopeType: 'SELF',
        metadata: { agent: 'worker' },
      });
      return `Deleted list ${action.listId}.`;
    }
    case 'create_template': {
      const id = randomUUID().replace(/-/g, '');
      executeSql(
        `
          INSERT INTO "Template" ("id", "name", "subject", "bodyHtml", "userId", "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [id, action.name.trim(), action.subject.trim(), action.bodyHtml, actor.userId, now, now],
      );
      await recordAuditEvent({
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'agent_create_template',
        entityType: 'Template',
        entityId: id,
        scopeType: 'SELF',
        metadata: { name: action.name, subject: action.subject, agent: 'worker' },
      });
      return `Created template "${action.name}".`;
    }
    case 'update_template': {
      const existing = queryRow<{ id: string }>('SELECT id FROM "Template" WHERE id = ? AND "userId" = ? LIMIT 1', [action.templateId, actor.userId]);
      if (!existing) return `Template ${action.templateId} was not found or is not owned by the user.`;
      const assignments: string[] = [];
      const params: unknown[] = [];
      const changedFields: string[] = [];
      if (action.name !== undefined) {
        assignments.push('"name" = ?');
        params.push(action.name?.trim() || null);
        changedFields.push('name');
      }
      if (action.subject !== undefined) {
        assignments.push('"subject" = ?');
        params.push(action.subject?.trim() || null);
        changedFields.push('subject');
      }
      if (action.bodyHtml !== undefined) {
        assignments.push('"bodyHtml" = ?');
        params.push(action.bodyHtml);
        changedFields.push('bodyHtml');
      }
      if (!assignments.length) return `No template changes were requested.`;
      executeSql(`UPDATE "Template" SET ${assignments.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ? AND "userId" = ?`, [...params, action.templateId, actor.userId]);
      await recordAuditEvent({
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'agent_update_template',
        entityType: 'Template',
        entityId: action.templateId,
        scopeType: 'SELF',
        metadata: { changedFields, agent: 'worker' },
      });
      return `Updated template ${action.templateId}.`;
    }
    case 'delete_template': {
      executeSql('DELETE FROM "Template" WHERE id = ? AND "userId" = ?', [action.templateId, actor.userId]);
      await recordAuditEvent({
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'agent_delete_template',
        entityType: 'Template',
        entityId: action.templateId,
        scopeType: 'SELF',
        metadata: { agent: 'worker' },
      });
      return `Deleted template ${action.templateId}.`;
    }
    case 'create_campaign': {
      const id = randomUUID().replace(/-/g, '');
      executeSql(
        `
          INSERT INTO "Campaign" ("id", "name", "subject", "bodyHtml", "status", "provider", "userId", "listId", "templateId", "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?, ?, ?)
        `,
        [id, action.name.trim(), action.subject.trim(), action.bodyHtml, actor.userId, action.listId, action.templateId || null, now, now],
      );
      await recordAuditEvent({
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'agent_create_campaign',
        entityType: 'Campaign',
        entityId: id,
        scopeType: 'SELF',
        metadata: { listId: action.listId, templateId: action.templateId || null, agent: 'worker' },
      });
      return `Created campaign "${action.name}".`;
    }
    case 'update_campaign': {
      const existing = queryRow<{ id: string }>('SELECT id FROM "Campaign" WHERE id = ? AND "userId" = ? LIMIT 1', [action.campaignId, actor.userId]);
      if (!existing) return `Campaign ${action.campaignId} was not found or is not owned by the user.`;
      const assignments: string[] = [];
      const params: unknown[] = [];
      const changedFields: string[] = [];
      if (action.name !== undefined) {
        assignments.push('"name" = ?');
        params.push(action.name?.trim() || null);
        changedFields.push('name');
      }
      if (action.subject !== undefined) {
        assignments.push('"subject" = ?');
        params.push(action.subject?.trim() || null);
        changedFields.push('subject');
      }
      if (action.bodyHtml !== undefined) {
        assignments.push('"bodyHtml" = ?');
        params.push(action.bodyHtml);
        changedFields.push('bodyHtml');
      }
      if (action.listId !== undefined) {
        assignments.push('"listId" = ?');
        params.push(action.listId);
        changedFields.push('listId');
      }
      if (action.templateId !== undefined) {
        assignments.push('"templateId" = ?');
        params.push(action.templateId || null);
        changedFields.push('templateId');
      }
      if (action.status !== undefined) {
        assignments.push('"status" = ?');
        params.push(action.status);
        changedFields.push('status');
      }
      if (!assignments.length) return `No campaign changes were requested.`;
      executeSql(`UPDATE "Campaign" SET ${assignments.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ? AND "userId" = ?`, [...params, action.campaignId, actor.userId]);
      await recordAuditEvent({
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'agent_update_campaign',
        entityType: 'Campaign',
        entityId: action.campaignId,
        scopeType: 'SELF',
        metadata: { changedFields, agent: 'worker' },
      });
      return `Updated campaign ${action.campaignId}.`;
    }
    case 'delete_campaign': {
      executeSql('DELETE FROM "Campaign" WHERE id = ? AND "userId" = ?', [action.campaignId, actor.userId]);
      await recordAuditEvent({
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'agent_delete_campaign',
        entityType: 'Campaign',
        entityId: action.campaignId,
        scopeType: 'SELF',
        metadata: { agent: 'worker' },
      });
      return `Deleted campaign ${action.campaignId}.`;
    }
    case 'add_contact': {
      const email = action.email?.trim().toLowerCase();
      if (!email) return 'Contact email is required.';
      const list = queryRow<{ id: string }>('SELECT id FROM "List" WHERE id = ? AND "userId" = ? LIMIT 1', [action.listId, actor.userId]);
      if (!list) return `List ${action.listId} was not found or is not owned by the user.`;
      const id = randomUUID().replace(/-/g, '');
      executeSql(
        `
          INSERT OR REPLACE INTO "Contact" ("id", "email", "firstName", "lastName", "status", "listId", "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, COALESCE((SELECT status FROM "Contact" WHERE email = ? AND "listId" = ? LIMIT 1), 'SUBSCRIBED'), ?, ?, ?)
        `,
        [id, email, action.firstName || null, action.lastName || null, email, action.listId, action.listId, now, now],
      );
      await recordAuditEvent({
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'agent_add_contact',
        entityType: 'Contact',
        entityId: id,
        scopeType: 'SELF',
        metadata: { listId: action.listId, email, agent: 'worker' },
      });
      return `Upserted contact ${email}.`;
    }
    case 'update_contact': {
      const existing = queryRow<{ id: string; listId: string }>(
        `
          SELECT c.id, c."listId"
          FROM "Contact" c
          INNER JOIN "List" l ON l.id = c."listId"
          WHERE c.id = ? AND l."userId" = ?
          LIMIT 1
        `,
        [action.contactId, actor.userId],
      );
      if (!existing) return `Contact ${action.contactId} was not found or is not owned by the user.`;
      const assignments: string[] = [];
      const params: unknown[] = [];
      if (action.email !== undefined) {
        const email = action.email?.trim().toLowerCase();
        if (!email) return `Contact email is required.`;
        assignments.push('"email" = ?');
        params.push(email);
      }
      if (action.firstName !== undefined) {
        assignments.push('"firstName" = ?');
        params.push(action.firstName || null);
      }
      if (action.lastName !== undefined) {
        assignments.push('"lastName" = ?');
        params.push(action.lastName || null);
      }
      if (action.status !== undefined) {
        assignments.push('"status" = ?');
        params.push(action.status);
      }
      if (!assignments.length) return `No contact changes were requested.`;
      executeSql(`UPDATE "Contact" SET ${assignments.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`, [...params, action.contactId]);
      await recordAuditEvent({
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'agent_update_contact',
        entityType: 'Contact',
        entityId: action.contactId,
        scopeType: 'SELF',
        metadata: { changedFields: Object.keys(assignments), agent: 'worker' },
      });
      return `Updated contact ${action.contactId}.`;
    }
    case 'delete_contact': {
      executeSql(
        `
          DELETE FROM "Contact"
          WHERE id IN (
            SELECT c.id
            FROM "Contact" c
            INNER JOIN "List" l ON l.id = c."listId"
            WHERE c.id = ? AND l."userId" = ?
          )
        `,
        [action.contactId, actor.userId],
      );
      await recordAuditEvent({
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'agent_delete_contact',
        entityType: 'Contact',
        entityId: action.contactId,
        scopeType: 'SELF',
        metadata: { agent: 'worker' },
      });
      return `Deleted contact ${action.contactId}.`;
    }
    case 'send_campaign': {
      const campaign = queryRow<{
        id: string;
        name: string;
        subject: string;
        bodyHtml: string;
        status: string;
        listId: string;
      }>(
        `
          SELECT c.id, c.name, c.subject, c."bodyHtml", c.status, c."listId"
          FROM "Campaign" c
          WHERE c.id = ? AND c."userId" = ?
          LIMIT 1
        `,
        [action.campaignId, actor.userId],
      );
      if (!campaign) return `Campaign ${action.campaignId} was not found or is not owned by the user.`;
      if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
        return `Campaign ${action.campaignId} is not in a sendable state.`;
      }
      const contacts = queryRows<{ id: string; email: string; status: string }>(
        `
          SELECT c.id, c.email, c.status
          FROM "Contact" c
          INNER JOIN "List" l ON l.id = c."listId"
          WHERE l.id = ? AND l."userId" = ?
          ORDER BY c."createdAt" ASC
        `,
        [campaign.listId, actor.userId],
      );

      const result = await dispatchCampaignEmails(actor.userId, {
        userId: actor.userId,
        campaignId: campaign.id,
        campaignName: campaign.name,
        subject: campaign.subject,
        bodyHtml: campaign.bodyHtml,
        appUrl: process.env.APP_URL || process.env.PUBLIC_APP_URL || 'http://localhost:3000',
        contacts,
      });
      await recordAuditEvent({
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'agent_send_campaign',
        entityType: 'Campaign',
        entityId: campaign.id,
        scopeType: 'SELF',
        metadata: { sentCount: result.sentCount, failedCount: result.failedCount, skippedCount: result.skippedCount, agent: 'worker' },
      });
      return `Sent campaign ${campaign.name}: ${result.sentCount} sent, ${result.failedCount} failed, ${result.skippedCount} skipped.`;
    }
    case 'send_test_email': {
      const result = await sendTestEmail(actor.userId, {
        toEmail: action.toEmail,
        subject: action.subject,
        bodyHtml: action.bodyHtml,
      });
      await recordAuditEvent({
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'agent_send_test_email',
        entityType: 'Email',
        entityId: action.toEmail,
        scopeType: 'SELF',
        metadata: { subject: action.subject, provider: result.provider, agent: 'worker' },
      });
      return `Test email sent to ${action.toEmail} using ${result.provider}.`;
    }
    default:
      return 'Unsupported action.';
  }
}

export async function runAgentChat(user: { userId: string; email: string; role: AgentRole }, input: AgentChatRequest) {
  ensureAiAgentsSchema();
  const profile = await resolveAiAgentProfile(input.agentKey);
  if (!profile.isEnabled) {
    throw new Error(`${profile.label} is currently disabled.`);
  }

  let conversationId = input.conversationId || '';
  if (conversationId) {
    const existingConversation = await getAgentConversation(conversationId, user.userId);
    if (!existingConversation) {
      throw new Error('Conversation not found or not owned by the current user.');
    }
  } else {
    conversationId = await createAgentConversation(user.userId, input.agentKey, input.message.slice(0, 40) || `${profile.label} chat`);
  }

  if (input.agentKey === 'worker' && input.executeActions && input.message === '__EXECUTE__') {
    const latestAssistant = queryRow<AgentMessageRow>(
      `
        SELECT id, "conversationId", role, content, "metadataJson", "createdAt"
        FROM "AgentMessage"
        WHERE "conversationId" = ? AND role = 'assistant'
        ORDER BY "createdAt" DESC
        LIMIT 1
      `,
      [conversationId],
    );

    const parsedActions = latestAssistant?.metadataJson ? safeJsonParse(latestAssistant.metadataJson).actions : [];
    const actions = Array.isArray(parsedActions) ? (parsedActions.filter(Boolean) as AgentAction[]) : [];
    const executed: Array<{ type: string; result: string }> = [];
    await recordAuditEvent({
      actorUserId: user.userId,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'agent_execute_actions',
      entityType: 'AgentConversation',
      entityId: conversationId,
      scopeType: 'SELF',
      metadata: { actionCount: actions.length, agent: input.agentKey },
    });
    for (const action of actions) {
      const result = await createEntityFromAction(user, action);
      executed.push({ type: action.type, result });
    }

    const summary = executed.length
      ? executed.map((entry) => `- ${entry.result}`).join('\n')
      : 'No executable actions were found in the last agent response.';
    await appendAgentMessage(conversationId, {
      role: 'assistant',
      content: `Execution complete.\n\n${summary}`,
      metadata: { executed },
    });

    const conversation = await getAgentConversation(conversationId, user.userId);
    if (!conversation) {
      throw new Error('Conversation could not be loaded after execution.');
    }

    return {
      conversation,
      reply: summary,
      actions,
      executed,
    } satisfies AgentChatResult;
  }

  const priorMessages = queryRows<AgentMessageRow>(
    `
      SELECT id, "conversationId", role, content, "metadataJson", "createdAt"
      FROM "AgentMessage"
      WHERE "conversationId" = ?
      ORDER BY "createdAt" ASC
      LIMIT 20
    `,
    [conversationId],
  );

  await appendAgentMessage(conversationId, { role: 'user', content: input.message });

  const context = await buildAgentContext(input.agentKey, user.userId, user.role);
  const profileRow = queryRow<StoredAiAgentProfile>(
    `
      SELECT
        "agentKey",
        label,
        description,
        provider,
        model,
        "baseUrl",
        "apiKeyEncrypted",
        "systemPrompt",
        "temperature",
        "maxOutputTokens",
        "isEnabled",
        "createdAt",
        "updatedAt"
      FROM "AiAgentProfile"
      WHERE "agentKey" = ?
      LIMIT 1
    `,
    [input.agentKey],
  );
  const apiKey = getAiAgentApiKey(profile, profileRow?.apiKeyEncrypted || null);
  const messages = [
    { role: 'system', content: buildRolePrompt(input.agentKey, profile) },
    { role: 'system', content: `User role: ${user.role}\nUser email: ${user.email}\nContext:\n${context}` },
    ...priorMessages.map((message) => ({ role: normalizeMessageRole(message.role), content: message.content })),
    { role: 'user', content: input.message },
  ];

  const rawReply = await callProvider(profile, apiKey, messages);
  const normalized = normalizeCompletion(rawReply, input.agentKey);

  const assistantMetadata: Record<string, unknown> = {
    provider: profile.provider,
    model: profile.model,
    actions: normalized.actions,
  };
  await appendAgentMessage(conversationId, {
    role: 'assistant',
    content: normalized.reply,
    metadata: assistantMetadata,
  });

  let executed: Array<{ type: string; result: string }> = [];
  if (input.agentKey === 'worker' && input.executeActions && normalized.actions.length) {
    for (const action of normalized.actions) {
      const result = await createEntityFromAction(user, action);
      executed.push({ type: action.type, result });
    }

    if (executed.length) {
      const summary = executed.map((entry) => `- ${entry.result}`).join('\n');
      await appendAgentMessage(conversationId, {
        role: 'assistant',
        content: `Execution complete.\n\n${summary}`,
        metadata: { executed },
      });
    }
  }

  const conversation = await getAgentConversation(conversationId, user.userId);
  if (!conversation) {
    throw new Error('Conversation could not be loaded after save.');
  }

  return {
    conversation,
    reply: normalized.reply,
    actions: normalized.actions,
    executed,
  } satisfies AgentChatResult;
}
