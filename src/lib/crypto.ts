import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto';

const WEAK_DEV_SECRET = 'dev-insecure-auth-secret-change-in-prod';

/**
 * Resolve the application secret used for both session signing (JWT) and
 * at-rest secret encryption (AES-256-GCM). In production we refuse to start
 * with a missing/weak/default secret so that sessions cannot be forged and
 * stored provider credentials cannot be decrypted with a publicly known key.
 */
export function resolveAppSecret() {
  const secret = (process.env.AUTH_SECRET || '').trim();

  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret === WEAK_DEV_SECRET || secret.length < 16) {
      throw new Error(
        'AUTH_SECRET must be set to a strong, unique value (at least 16 characters) in production. ' +
          'Refusing to use the insecure default secret.',
      );
    }
    return secret;
  }

  return secret || WEAK_DEV_SECRET;
}

function getKey() {
  return createHash('sha256').update(resolveAppSecret()).digest();
}

/**
 * Constant-time secret comparison. Both inputs are hashed first so the compared
 * buffers are always equal length (no length leak) and the comparison never
 * short-circuits on the first differing byte.
 */
export function safeCompareSecret(received: string | null | undefined, expected: string | null | undefined) {
  if (!received || !expected) return false;
  const a = createHash('sha256').update(received).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
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
