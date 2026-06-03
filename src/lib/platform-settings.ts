import { executeSql, queryRow } from '@/lib/sqlite';

type PlatformSettingsRow = {
  id: string;
  imageUploadLimitKb: number;
  sendingDomain: string | null;
  spfVerified: number | boolean;
  dkimVerified: number | boolean;
  dmarcVerified: number | boolean;
  createdAt: string;
  updatedAt: string;
};

export type PlatformSettingsView = {
  imageUploadLimitKb: number;
  sendingDomain: string;
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  source: 'database' | 'env';
};

const DEFAULT_IMAGE_UPLOAD_LIMIT_KB = Number(process.env.DEFAULT_IMAGE_UPLOAD_LIMIT_KB || 50);

let platformSettingsInitialized = false;

function isDuplicateColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /duplicate column name|already exists/i.test(message);
}

export function ensurePlatformSettingsSchema() {
  if (platformSettingsInitialized) return;

  executeSql(`
    CREATE TABLE IF NOT EXISTS "PlatformSettings" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "imageUploadLimitKb" INTEGER NOT NULL DEFAULT ${Number.isFinite(DEFAULT_IMAGE_UPLOAD_LIMIT_KB) && DEFAULT_IMAGE_UPLOAD_LIMIT_KB > 0 ? Math.floor(DEFAULT_IMAGE_UPLOAD_LIMIT_KB) : 50},
      "sendingDomain" TEXT,
      "spfVerified" BOOLEAN NOT NULL DEFAULT FALSE,
      "dkimVerified" BOOLEAN NOT NULL DEFAULT FALSE,
      "dmarcVerified" BOOLEAN NOT NULL DEFAULT FALSE,
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    executeSql('ALTER TABLE "User" ADD COLUMN "imageUploadLimitKb" INTEGER');
  } catch (error) {
    if (!isDuplicateColumnError(error)) throw error;
  }

  for (const statement of [
    'ALTER TABLE "PlatformSettings" ADD COLUMN "sendingDomain" TEXT',
    'ALTER TABLE "PlatformSettings" ADD COLUMN "spfVerified" BOOLEAN NOT NULL DEFAULT FALSE',
    'ALTER TABLE "PlatformSettings" ADD COLUMN "dkimVerified" BOOLEAN NOT NULL DEFAULT FALSE',
    'ALTER TABLE "PlatformSettings" ADD COLUMN "dmarcVerified" BOOLEAN NOT NULL DEFAULT FALSE',
  ]) {
    try {
      executeSql(statement);
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }
  }

  executeSql(
    `
      INSERT INTO "PlatformSettings" (
        "id",
        "imageUploadLimitKb",
        "sendingDomain",
        "spfVerified",
        "dkimVerified",
        "dmarcVerified",
        "createdAt",
        "updatedAt"
      )
      VALUES ('global', ?, NULL, FALSE, FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT("id") DO NOTHING
    `,
    [Number.isFinite(DEFAULT_IMAGE_UPLOAD_LIMIT_KB) && DEFAULT_IMAGE_UPLOAD_LIMIT_KB > 0 ? Math.floor(DEFAULT_IMAGE_UPLOAD_LIMIT_KB) : 50],
  );

  platformSettingsInitialized = true;
}

export async function getPlatformSettings(): Promise<PlatformSettingsView> {
  ensurePlatformSettingsSchema();

  const row = queryRow<PlatformSettingsRow>(
    'SELECT "id", "imageUploadLimitKb", "sendingDomain", "spfVerified", "dkimVerified", "dmarcVerified", "createdAt", "updatedAt" FROM "PlatformSettings" WHERE "id" = ? LIMIT 1',
    ['global'],
  );

  return {
    imageUploadLimitKb: row?.imageUploadLimitKb || (Number.isFinite(DEFAULT_IMAGE_UPLOAD_LIMIT_KB) && DEFAULT_IMAGE_UPLOAD_LIMIT_KB > 0 ? Math.floor(DEFAULT_IMAGE_UPLOAD_LIMIT_KB) : 50),
    sendingDomain: row?.sendingDomain || '',
    spfVerified: Boolean(row?.spfVerified),
    dkimVerified: Boolean(row?.dkimVerified),
    dmarcVerified: Boolean(row?.dmarcVerified),
    source: row ? 'database' : 'env',
  };
}

export async function savePlatformSettings(input: {
  imageUploadLimitKb?: number;
  sendingDomain?: string;
  spfVerified?: boolean;
  dkimVerified?: boolean;
  dmarcVerified?: boolean;
}) {
  ensurePlatformSettingsSchema();

  const current = queryRow<PlatformSettingsRow>(
    'SELECT "id", "imageUploadLimitKb", "sendingDomain", "spfVerified", "dkimVerified", "dmarcVerified", "createdAt", "updatedAt" FROM "PlatformSettings" WHERE "id" = ? LIMIT 1',
    ['global'],
  );

  const imageUploadLimitKb = Number.isFinite(input.imageUploadLimitKb) && (input.imageUploadLimitKb || 0) > 0 ? Math.floor(input.imageUploadLimitKb as number) : Math.floor(DEFAULT_IMAGE_UPLOAD_LIMIT_KB || 50);
  const sendingDomain = input.sendingDomain !== undefined ? String(input.sendingDomain || '').trim() : current?.sendingDomain || '';
  const spfVerified = typeof input.spfVerified === 'boolean' ? input.spfVerified : Boolean(current?.spfVerified);
  const dkimVerified = typeof input.dkimVerified === 'boolean' ? input.dkimVerified : Boolean(current?.dkimVerified);
  const dmarcVerified = typeof input.dmarcVerified === 'boolean' ? input.dmarcVerified : Boolean(current?.dmarcVerified);

  executeSql(
    `
      INSERT INTO "PlatformSettings" (
        "id",
        "imageUploadLimitKb",
        "sendingDomain",
        "spfVerified",
        "dkimVerified",
        "dmarcVerified",
        "createdAt",
        "updatedAt"
      )
      VALUES ('global', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT("id") DO UPDATE SET
        "imageUploadLimitKb" = excluded."imageUploadLimitKb",
        "sendingDomain" = excluded."sendingDomain",
        "spfVerified" = excluded."spfVerified",
        "dkimVerified" = excluded."dkimVerified",
        "dmarcVerified" = excluded."dmarcVerified",
        "updatedAt" = CURRENT_TIMESTAMP
    `,
    [
      imageUploadLimitKb,
      sendingDomain || null,
      spfVerified,
      dkimVerified,
      dmarcVerified,
    ],
  );
}

export function resolveImageUploadLimitKb(userLimitKb: number | null | undefined, platformLimitKb: number) {
  if (typeof userLimitKb === 'number' && Number.isFinite(userLimitKb) && userLimitKb > 0) {
    return Math.floor(userLimitKb);
  }

  return Math.floor(platformLimitKb);
}
