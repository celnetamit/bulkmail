import { randomUUID } from 'node:crypto';
import { executeSql, queryRows } from '@/lib/sqlite';

export type AuditScope = 'GLOBAL' | 'TEAM' | 'SELF';

export type AuditLogInput = {
  actorUserId: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  scopeType?: AuditScope;
  metadata?: Record<string, unknown> | null;
};

let auditSchemaInitialized = false;

export function ensureAuditSchema() {
  if (auditSchemaInitialized) return;

  executeSql(`
    CREATE TABLE IF NOT EXISTS "AuditLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "actorUserId" TEXT NOT NULL,
      "actorEmail" TEXT NOT NULL,
      "actorRole" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "entityType" TEXT NOT NULL,
      "entityId" TEXT,
      "scopeType" TEXT NOT NULL DEFAULT 'SELF',
      "metadataJson" TEXT,
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  executeSql('CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog" ("createdAt")');
  executeSql('CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_createdAt_idx" ON "AuditLog" ("actorUserId", "createdAt")');
  executeSql('CREATE INDEX IF NOT EXISTS "AuditLog_entityType_createdAt_idx" ON "AuditLog" ("entityType", "createdAt")');

  auditSchemaInitialized = true;
}

export async function recordAuditEvent(input: AuditLogInput) {
  ensureAuditSchema();

  executeSql(
    `
      INSERT INTO "AuditLog" (
        "id",
        "actorUserId",
        "actorEmail",
        "actorRole",
        "action",
        "entityType",
        "entityId",
        "scopeType",
        "metadataJson",
        "createdAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [
      randomUUID().replace(/-/g, ''),
      input.actorUserId,
      input.actorEmail,
      input.actorRole,
      input.action,
      input.entityType,
      input.entityId || null,
      input.scopeType || 'SELF',
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}

export function listRecentAuditEvents(limit = 10) {
  ensureAuditSchema();

  return queryRows<{
    id: string;
    actorUserId: string;
    actorEmail: string;
    actorRole: string;
    action: string;
    entityType: string;
    entityId: string | null;
    scopeType: string;
    metadataJson: string | null;
    createdAt: string;
  }>(
    `
      SELECT id, actorUserId, actorEmail, actorRole, action, entityType, entityId, scopeType, metadataJson, createdAt
      FROM "AuditLog"
      ORDER BY createdAt DESC
      LIMIT ?
    `,
    [limit],
  );
}

