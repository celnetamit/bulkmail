import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname } from 'node:path';

import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { getAppOrigin } from '@/lib/google-oauth';
import { getPlatformSettings, resolveImageUploadLimitKb } from '@/lib/platform-settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const UPLOAD_DIR = `${process.cwd()}/public/uploads/email-media`;
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tif', '.tiff', '.avif']);

type UploadMetadata = {
  folder: string;
  tags: string[];
  title: string;
  width: number | null;
  height: number | null;
};

type MediaUploadRow = {
  fileName: string;
  relativeUrl: string;
  url: string;
  size: number;
  lastModified: string;
  folder: string;
  tags: string[];
  title: string;
  width: number | null;
  height: number | null;
};

function sanitizeBaseName(name: string) {
  return name
    .replace(/\.[^.]+$/, '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'upload';
}

function fileExtension(file: File) {
  const fromName = extname(file.name || '').toLowerCase();
  if (fromName) return fromName;

  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
    'image/tiff': '.tiff',
    'image/x-icon': '.ico',
  };

  return mimeToExt[file.type] || '.png';
}

function isImageFile(name: string) {
  return IMAGE_EXTENSIONS.has(extname(name).toLowerCase());
}

function metadataFileName(fileName: string) {
  return `${fileName}.meta.json`;
}

function normalizeTagList(tags: unknown) {
  if (!Array.isArray(tags)) return [];
  return Array.from(
    new Set(
      tags
        .map((tag) => String(tag || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 12);
}

function parseTags(value: unknown) {
  if (Array.isArray(value)) return normalizeTagList(value);
  if (typeof value !== 'string') return [];
  return normalizeTagList(
    value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
}

function parseOptionalDimension(value: unknown) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(4096, Math.floor(parsed));
}

async function readUploadMetadata(directory: string, fileName: string): Promise<UploadMetadata> {
  try {
    const raw = await readFile(`${directory}/${metadataFileName(fileName)}`, 'utf8');
    const parsed = JSON.parse(raw) as Partial<UploadMetadata> | null;
    return {
      folder: String(parsed?.folder || '').trim(),
      tags: normalizeTagList(parsed?.tags),
      title: String(parsed?.title || '').trim(),
      width: parseOptionalDimension(parsed?.width),
      height: parseOptionalDimension(parsed?.height),
    };
  } catch {
    return { folder: '', tags: [], title: '', width: null, height: null };
  }
}

async function writeUploadMetadata(directory: string, fileName: string, metadata: UploadMetadata) {
  await writeFile(
    `${directory}/${metadataFileName(fileName)}`,
    JSON.stringify(
      {
        folder: metadata.folder.trim(),
        tags: normalizeTagList(metadata.tags),
        title: metadata.title.trim(),
        width: parseOptionalDimension(metadata.width),
        height: parseOptionalDimension(metadata.height),
      },
      null,
      2,
    ),
  );
}

export async function GET(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const directory = `${UPLOAD_DIR}/${auth.user.userId}`;
  if (!existsSync(directory)) {
    return ok({ uploads: [] });
  }

  const files = (await readdir(directory)).filter((fileName) => !fileName.startsWith('.') && isImageFile(fileName));
  const uploads = await Promise.all(
    files.map(async (fileName) => {
      const filePath = `${directory}/${fileName}`;
      const fileStats = await stat(filePath);
      const relativeUrl = `/uploads/email-media/${auth.user.userId}/${fileName}`;
      const metadata = await readUploadMetadata(directory, fileName);
      return {
        fileName,
        relativeUrl,
        url: `${getAppOrigin(request)}${relativeUrl}`,
        size: fileStats.size,
        lastModified: fileStats.mtime.toISOString(),
        folder: metadata.folder,
        tags: metadata.tags,
        title: metadata.title,
        width: metadata.width,
        height: metadata.height,
      };
    }),
  );

  uploads.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
  return ok({ uploads });
}

export async function POST(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail('Invalid upload body.', 400);
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return fail('file is required.', 400);
  }

  if (!file.type.startsWith('image/')) {
    return fail('Only image uploads are allowed.', 400);
  }

  const platformSettings = await getPlatformSettings();
  const maxUploadKb = resolveImageUploadLimitKb(auth.user.imageUploadLimitKb, platformSettings.imageUploadLimitKb);
  const maxUploadBytes = maxUploadKb * 1024;

  if (file.size > maxUploadBytes) {
    return fail(`Image must be ${maxUploadKb} KB or smaller.`, 400);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const baseName = sanitizeBaseName(file.name);
  const ext = fileExtension(file);
  const fileName = `${baseName}-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}${ext}`;
  const directory = `${UPLOAD_DIR}/${auth.user.userId}`;
  const folder = String(formData.get('folder') || '').trim();
  const title = String(formData.get('title') || '').trim();
  const tags = parseTags(formData.get('tags'));
  const width = parseOptionalDimension(formData.get('width'));
  const height = parseOptionalDimension(formData.get('height'));

  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/${fileName}`, bytes);
  await writeUploadMetadata(directory, fileName, { folder, tags, title, width, height });

  const relativeUrl = `/uploads/email-media/${auth.user.userId}/${fileName}`;
  const publicUrl = `${getAppOrigin(request)}${relativeUrl}`;
  return ok({ url: publicUrl, relativeUrl, fileName, size: file.size, maxUploadKb, folder, tags, title, width, height }, 201);
}

export async function PATCH(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  if (!body || typeof body !== 'object') {
    return fail('Upload metadata payload is required.', 400);
  }

  const fileName = 'fileName' in body ? String((body as Record<string, unknown>).fileName || '').trim() : '';
  const folder = 'folder' in body ? String((body as Record<string, unknown>).folder || '').trim() : '';
  const title = 'title' in body ? String((body as Record<string, unknown>).title || '').trim() : '';
  const tags = parseTags((body as Record<string, unknown>).tags);
  const width = parseOptionalDimension((body as Record<string, unknown>).width);
  const height = parseOptionalDimension((body as Record<string, unknown>).height);

  if (!fileName) return fail('fileName is required.', 400);
  if (!isImageFile(fileName)) return fail('Invalid media file.', 400);

  const directory = `${UPLOAD_DIR}/${auth.user.userId}`;
  if (!existsSync(`${directory}/${fileName}`)) {
    return fail('Media file not found.', 404);
  }

  await writeUploadMetadata(directory, fileName, { folder, tags, title, width, height });

  const relativeUrl = `/uploads/email-media/${auth.user.userId}/${fileName}`;
  return ok({
    fileName,
    relativeUrl,
    url: `${getAppOrigin(request)}${relativeUrl}`,
    folder,
    tags,
    title,
    width,
    height,
  });
}
