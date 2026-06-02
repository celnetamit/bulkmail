import { mkdir, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';

import { ok, fail } from '@/lib/http';
import { requireUserFromCookies } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_UPLOAD_SIZE = 50 * 1024;
const UPLOAD_DIR = `${process.cwd()}/public/uploads/email-media`;

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

  if (file.size > MAX_UPLOAD_SIZE) {
    return fail('Image must be 50 KB or smaller.', 400);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const baseName = sanitizeBaseName(file.name);
  const ext = fileExtension(file);
  const fileName = `${baseName}-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}${ext}`;
  const directory = `${UPLOAD_DIR}/${auth.user.userId}`;

  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/${fileName}`, bytes);

  const url = `/uploads/email-media/${auth.user.userId}/${fileName}`;
  return ok({ url, fileName, size: file.size }, 201);
}
