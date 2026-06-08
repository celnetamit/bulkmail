import { randomUUID } from 'crypto';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { isValidEmailAddress, normalizeEmailAddress } from '@/lib/email-address';
import { executeSql, queryRow } from '@/lib/sqlite';

export type MailProvider = 'mock' | 'resend' | 'aws-ses';

type StoredMailSettings = {
  provider: string;
  awsRegion: string | null;
  awsFromEmail: string | null;
  awsAccessKeyIdEncrypted: string | null;
  awsSecretAccessKeyEncrypted: string | null;
  awsSessionTokenEncrypted: string | null;
  resendApiKeyEncrypted: string | null;
  resendFromEmail: string | null;
  webhookSharedSecretEncrypted: string | null;
};

export type MailSettingsView = {
  provider: MailProvider;
  awsRegion: string;
  awsFromEmail: string;
  hasAwsAccessKeyId: boolean;
  hasAwsSecretAccessKey: boolean;
  hasAwsSessionToken: boolean;
  resendApiKeyMasked: boolean;
  resendFromEmail: string;
  hasWebhookSharedSecret: boolean;
  source: 'database' | 'env';
};

export type MailSettingsInput = {
  provider: string;
  awsRegion?: string;
  awsFromEmail?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsSessionToken?: string;
  resendApiKey?: string;
  resendFromEmail?: string;
  webhookSharedSecret?: string;
};

export type ResolvedMailTransport = {
  provider: MailProvider;
  awsRegion?: string;
  awsFromEmail?: string;
  awsCredentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  resendApiKey?: string;
  resendFromEmail?: string;
};

type SenderIdentityRow = {
  email: string;
  name: string | null;
  senderFromName: string | null;
  senderFromEmail: string | null;
  senderReplyToEmail: string | null;
};

export type SenderIdentityView = {
  defaultFromName: string;
  defaultFromEmail: string;
  defaultReplyToEmail: string;
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  senderFromName: string;
  senderFromEmail: string;
  senderReplyToEmail: string;
};

let senderIdentitySchemaInitialized = false;

function hasPostgresDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

function columnExists(tableName: string, columnName: string) {
  if (hasPostgresDatabase()) {
    const row = queryRow<{ present: number }>(
      `
        SELECT 1 AS present
        FROM information_schema.columns
        WHERE table_schema = CURRENT_SCHEMA()
          AND table_name = ?
          AND column_name = ?
        LIMIT 1
      `,
      [tableName, columnName],
    );
    return Boolean(row?.present);
  }

  const row = queryRow<{ present: number }>(
    `
      SELECT 1 AS present
      FROM pragma_table_info(?)
      WHERE name = ?
      LIMIT 1
    `,
    [tableName, columnName],
  );
  return Boolean(row?.present);
}

function normalizeOptionalEmail(value: string | null | undefined) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return normalizeEmailAddress(trimmed);
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = String(value || '').trim();
  return trimmed || '';
}

function validateOptionalEmail(value: string, fieldLabel: string) {
  if (value && !isValidEmailAddress(value)) {
    throw new Error(`${fieldLabel} must be a valid email address.`);
  }
}

export function ensureSenderIdentitySchema() {
  if (senderIdentitySchemaInitialized) return;

  for (const columnName of ['senderFromName', 'senderFromEmail', 'senderReplyToEmail']) {
    if (!columnExists('User', columnName)) {
      executeSql(`ALTER TABLE "User" ADD COLUMN "${columnName}" TEXT`);
    }
  }

  senderIdentitySchemaInitialized = true;
}

function normalizeProvider(value: string | null | undefined): MailProvider {
  const provider = String(value || process.env.MAIL_PROVIDER || 'mock').toLowerCase();
  if (provider === 'resend' || provider === 'aws-ses') return provider;
  return 'mock';
}

function getEnvTransport(): ResolvedMailTransport {
  const provider = normalizeProvider(process.env.MAIL_PROVIDER);
  return {
    provider,
    awsRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
    awsFromEmail: process.env.AWS_SES_FROM_EMAIL,
    awsCredentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
          }
        : undefined,
    resendApiKey: process.env.RESEND_API_KEY,
    resendFromEmail: process.env.RESEND_FROM_EMAIL,
  };
}

async function getStoredSettings(userId: string) {
  ensureSenderIdentitySchema();
  return queryRow<StoredMailSettings>(
    `
      SELECT
        provider,
        "awsRegion",
        "awsFromEmail",
        "awsAccessKeyIdEncrypted",
        "awsSecretAccessKeyEncrypted",
        "awsSessionTokenEncrypted",
        "resendApiKeyEncrypted",
        "resendFromEmail",
        "webhookSharedSecretEncrypted"
      FROM "MailSettings"
      WHERE "userId" = ?
      LIMIT 1
    `,
    [userId],
  );
}

async function getSenderIdentityRow(userId: string) {
  ensureSenderIdentitySchema();
  return queryRow<SenderIdentityRow>(
    `
      SELECT
        email,
        name,
        "senderFromName",
        "senderFromEmail",
        "senderReplyToEmail"
      FROM "User"
      WHERE "id" = ?
      LIMIT 1
    `,
    [userId],
  );
}

export async function getSenderIdentity(userId: string): Promise<SenderIdentityView> {
  const row = await getSenderIdentityRow(userId);
  if (!row) {
    throw new Error('User account not found.');
  }

  const defaultFromEmail = normalizeEmailAddress(row.email);
  const defaultFromName = normalizeOptionalText(row.name) || row.email;
  const storedFromName = normalizeOptionalText(row.senderFromName);
  const storedFromEmail = normalizeOptionalEmail(row.senderFromEmail);
  const storedReplyToEmail = normalizeOptionalEmail(row.senderReplyToEmail);
  const fromEmail = storedFromEmail || defaultFromEmail;
  const fromName = storedFromName || defaultFromName;
  const replyToEmail = storedReplyToEmail || fromEmail;

  return {
    defaultFromName,
    defaultFromEmail,
    defaultReplyToEmail: fromEmail,
    fromName,
    fromEmail,
    replyToEmail,
    senderFromName: storedFromName,
    senderFromEmail: storedFromEmail,
    senderReplyToEmail: storedReplyToEmail,
  };
}

export async function saveSenderIdentity(
  userId: string,
  input: { senderFromName?: string; senderFromEmail?: string; senderReplyToEmail?: string },
) {
  ensureSenderIdentitySchema();

  const current = await getSenderIdentity(userId);
  const nextSenderFromName =
    input.senderFromName !== undefined ? normalizeOptionalText(input.senderFromName) : current.senderFromName;
  const nextSenderFromEmail =
    input.senderFromEmail !== undefined ? normalizeOptionalEmail(input.senderFromEmail) : current.senderFromEmail;
  const fallbackFromEmail = nextSenderFromEmail || current.defaultFromEmail;
  const nextSenderReplyToEmail =
    input.senderReplyToEmail !== undefined
      ? normalizeOptionalEmail(input.senderReplyToEmail)
      : current.senderReplyToEmail;

  validateOptionalEmail(nextSenderFromEmail, 'From email');
  validateOptionalEmail(nextSenderReplyToEmail, 'Reply-to email');
  validateOptionalEmail(fallbackFromEmail, 'From email');

  executeSql(
    `
      UPDATE "User"
      SET
        "senderFromName" = ?,
        "senderFromEmail" = ?,
        "senderReplyToEmail" = ?,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ?
    `,
    [nextSenderFromName || null, nextSenderFromEmail || null, nextSenderReplyToEmail || null, userId],
  );

  return getSenderIdentity(userId);
}

export async function getMailSettings(userId: string): Promise<MailSettingsView> {
  const row = await getStoredSettings(userId);

  if (!row) {
    const env = getEnvTransport();
    return {
      provider: env.provider,
      awsRegion: env.awsRegion || '',
      awsFromEmail: env.awsFromEmail || '',
      hasAwsAccessKeyId: Boolean(env.awsCredentials?.accessKeyId),
      hasAwsSecretAccessKey: Boolean(env.awsCredentials?.secretAccessKey),
      hasAwsSessionToken: Boolean(env.awsCredentials?.sessionToken),
      resendApiKeyMasked: Boolean(env.resendApiKey),
      resendFromEmail: env.resendFromEmail || '',
      hasWebhookSharedSecret: Boolean(process.env.WEBHOOK_SHARED_SECRET),
      source: 'env',
    };
  }

  return {
    provider: normalizeProvider(row.provider),
    awsRegion: row.awsRegion || '',
    awsFromEmail: row.awsFromEmail || '',
    hasAwsAccessKeyId: Boolean(row.awsAccessKeyIdEncrypted),
    hasAwsSecretAccessKey: Boolean(row.awsSecretAccessKeyEncrypted),
    hasAwsSessionToken: Boolean(row.awsSessionTokenEncrypted),
    resendApiKeyMasked: Boolean(row.resendApiKeyEncrypted),
    resendFromEmail: row.resendFromEmail || '',
    hasWebhookSharedSecret: Boolean(row.webhookSharedSecretEncrypted),
    source: 'database',
  };
}

export async function saveMailSettings(userId: string, input: MailSettingsInput) {
  const current = await getStoredSettings(userId);
  const provider = normalizeProvider(input.provider);
  const awsRegion = String(input.awsRegion || current?.awsRegion || '').trim();
  const awsFromEmail = String(input.awsFromEmail || current?.awsFromEmail || '').trim();
  const resendFromEmail = String(input.resendFromEmail || current?.resendFromEmail || '').trim();

  const payload = {
    provider,
    awsRegion: awsRegion || null,
    awsFromEmail: awsFromEmail || null,
    awsAccessKeyIdEncrypted:
      input.awsAccessKeyId && input.awsAccessKeyId.trim()
        ? encryptSecret(input.awsAccessKeyId)
        : current?.awsAccessKeyIdEncrypted ?? null,
    awsSecretAccessKeyEncrypted:
      input.awsSecretAccessKey && input.awsSecretAccessKey.trim()
        ? encryptSecret(input.awsSecretAccessKey)
        : current?.awsSecretAccessKeyEncrypted ?? null,
    awsSessionTokenEncrypted:
      input.awsSessionToken && input.awsSessionToken.trim()
        ? encryptSecret(input.awsSessionToken)
        : current?.awsSessionTokenEncrypted ?? null,
    resendApiKeyEncrypted:
      input.resendApiKey && input.resendApiKey.trim()
        ? encryptSecret(input.resendApiKey)
        : current?.resendApiKeyEncrypted ?? null,
    resendFromEmail: resendFromEmail || null,
    webhookSharedSecretEncrypted:
      input.webhookSharedSecret && input.webhookSharedSecret.trim()
        ? encryptSecret(input.webhookSharedSecret)
        : current?.webhookSharedSecretEncrypted ?? null,
  };

  if (current) {
    executeSql(
      `
        UPDATE "MailSettings"
        SET
          provider = ?,
          "awsRegion" = ?,
          "awsFromEmail" = ?,
          "awsAccessKeyIdEncrypted" = ?,
          "awsSecretAccessKeyEncrypted" = ?,
          "awsSessionTokenEncrypted" = ?,
          "resendApiKeyEncrypted" = ?,
          "resendFromEmail" = ?,
          "webhookSharedSecretEncrypted" = ?,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "userId" = ?
      `,
      [
        payload.provider,
        payload.awsRegion,
        payload.awsFromEmail,
        payload.awsAccessKeyIdEncrypted,
        payload.awsSecretAccessKeyEncrypted,
        payload.awsSessionTokenEncrypted,
        payload.resendApiKeyEncrypted,
        payload.resendFromEmail,
        payload.webhookSharedSecretEncrypted,
        userId,
      ],
    );
  } else {
    executeSql(
      `
        INSERT INTO "MailSettings" (
          "id",
          "userId",
          "provider",
          "awsRegion",
          "awsFromEmail",
          "awsAccessKeyIdEncrypted",
          "awsSecretAccessKeyEncrypted",
          "awsSessionTokenEncrypted",
          "resendApiKeyEncrypted",
          "resendFromEmail",
          "webhookSharedSecretEncrypted",
          "createdAt",
          "updatedAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [
        randomUUID(),
        userId,
        payload.provider,
        payload.awsRegion,
        payload.awsFromEmail,
        payload.awsAccessKeyIdEncrypted,
        payload.awsSecretAccessKeyEncrypted,
        payload.awsSessionTokenEncrypted,
        payload.resendApiKeyEncrypted,
        payload.resendFromEmail,
        payload.webhookSharedSecretEncrypted,
      ],
    );
  }
}

export async function resolveMailTransport(userId: string): Promise<ResolvedMailTransport> {
  const row = await getStoredSettings(userId);
  const env = getEnvTransport();
  const provider = normalizeProvider(row?.provider || env.provider);

  const awsRegion = row?.awsRegion || env.awsRegion;
  const awsFromEmail = row?.awsFromEmail || env.awsFromEmail;
  const awsAccessKeyId = row?.awsAccessKeyIdEncrypted
    ? decryptSecret(row.awsAccessKeyIdEncrypted)
    : env.awsCredentials?.accessKeyId;
  const awsSecretAccessKey = row?.awsSecretAccessKeyEncrypted
    ? decryptSecret(row.awsSecretAccessKeyEncrypted)
    : env.awsCredentials?.secretAccessKey;
  const awsSessionToken = row?.awsSessionTokenEncrypted
    ? decryptSecret(row.awsSessionTokenEncrypted)
    : env.awsCredentials?.sessionToken;

  const resendApiKey = row?.resendApiKeyEncrypted
    ? decryptSecret(row.resendApiKeyEncrypted)
    : env.resendApiKey;
  const resendFromEmail = row?.resendFromEmail || env.resendFromEmail;

  return {
    provider,
    awsRegion,
    awsFromEmail,
    awsCredentials:
      awsAccessKeyId && awsSecretAccessKey
        ? {
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey,
            sessionToken: awsSessionToken || undefined,
          }
        : undefined,
    resendApiKey: resendApiKey || undefined,
    resendFromEmail,
  };
}

export async function getWebhookSharedSecret(userId: string) {
  const row = queryRow<{ webhookSharedSecretEncrypted: string | null }>(
    `
      SELECT "webhookSharedSecretEncrypted"
      FROM "MailSettings"
      WHERE "userId" = ?
      LIMIT 1
    `,
    [userId],
  );
  const decrypted = row?.webhookSharedSecretEncrypted
    ? decryptSecret(row.webhookSharedSecretEncrypted)
    : null;
  return decrypted || process.env.WEBHOOK_SHARED_SECRET || '';
}
