import { executeSql, queryRow } from '@/lib/sqlite';

type PlatformSettingsRow = {
  id: string;
  imageUploadLimitKb: number;
  createdAt: string;
  updatedAt: string;
};

export type PlatformSettingsView = {
  imageUploadLimitKb: number;
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
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    executeSql('ALTER TABLE "User" ADD COLUMN "imageUploadLimitKb" INTEGER');
  } catch (error) {
    if (!isDuplicateColumnError(error)) throw error;
  }

  executeSql(
    `
      INSERT INTO "PlatformSettings" ("id", "imageUploadLimitKb", "createdAt", "updatedAt")
      VALUES ('global', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT("id") DO NOTHING
    `,
    [Number.isFinite(DEFAULT_IMAGE_UPLOAD_LIMIT_KB) && DEFAULT_IMAGE_UPLOAD_LIMIT_KB > 0 ? Math.floor(DEFAULT_IMAGE_UPLOAD_LIMIT_KB) : 50],
  );

  platformSettingsInitialized = true;
}

export async function getPlatformSettings(): Promise<PlatformSettingsView> {
  ensurePlatformSettingsSchema();

  const row = queryRow<PlatformSettingsRow>(
    'SELECT id, imageUploadLimitKb, createdAt, updatedAt FROM "PlatformSettings" WHERE id = ? LIMIT 1',
    ['global'],
  );

  return {
    imageUploadLimitKb: row?.imageUploadLimitKb || (Number.isFinite(DEFAULT_IMAGE_UPLOAD_LIMIT_KB) && DEFAULT_IMAGE_UPLOAD_LIMIT_KB > 0 ? Math.floor(DEFAULT_IMAGE_UPLOAD_LIMIT_KB) : 50),
    source: row ? 'database' : 'env',
  };
}

export async function savePlatformSettings(input: { imageUploadLimitKb?: number }) {
  ensurePlatformSettingsSchema();

  const imageUploadLimitKb = Number.isFinite(input.imageUploadLimitKb) && (input.imageUploadLimitKb || 0) > 0 ? Math.floor(input.imageUploadLimitKb as number) : Math.floor(DEFAULT_IMAGE_UPLOAD_LIMIT_KB || 50);

  executeSql(
    `
      INSERT INTO "PlatformSettings" ("id", "imageUploadLimitKb", "createdAt", "updatedAt")
      VALUES ('global', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT("id") DO UPDATE SET
        "imageUploadLimitKb" = excluded."imageUploadLimitKb",
        "updatedAt" = CURRENT_TIMESTAMP
    `,
    [imageUploadLimitKb],
  );
}

export function resolveImageUploadLimitKb(userLimitKb: number | null | undefined, platformLimitKb: number) {
  if (typeof userLimitKb === 'number' && Number.isFinite(userLimitKb) && userLimitKb > 0) {
    return Math.floor(userLimitKb);
  }

  return Math.floor(platformLimitKb);
}
