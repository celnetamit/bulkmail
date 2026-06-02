import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
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
      return {
        fileName,
        relativeUrl,
        url: `${getAppOrigin(request)}${relativeUrl}`,
        size: fileStats.size,
        lastModified: fileStats.mtime.toISOString(),
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

  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/${fileName}`, bytes);

  const relativeUrl = `/uploads/email-media/${auth.user.userId}/${fileName}`;
  const publicUrl = `${getAppOrigin(request)}${relativeUrl}`;
  return ok({ url: publicUrl, relativeUrl, fileName, size: file.size, maxUploadKb }, 201);
}
