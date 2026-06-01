import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function getKey() {
  const secret = process.env.AUTH_SECRET || 'dev-insecure-auth-secret-change-in-prod';
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(value: string | null | undefined) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) return null;

  const raw = Buffer.from(value, 'base64url');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);

  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
