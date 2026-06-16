import { decryptSecret, safeCompareSecret } from '@/lib/crypto';
import { queryRow } from '@/lib/sqlite';

export async function verifyWebhookSecret(request: Request) {
  const received = request.headers.get('x-webhook-secret') || '';
  const envExpected = process.env.WEBHOOK_SHARED_SECRET || '';

  if (envExpected) {
    return safeCompareSecret(received, envExpected);
  }

  const row = queryRow<{ webhookSharedSecretEncrypted: string | null }>(
    `
      SELECT "webhookSharedSecretEncrypted"
      FROM "MailSettings"
      WHERE "webhookSharedSecretEncrypted" IS NOT NULL
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `,
  );
  const expected = row?.webhookSharedSecretEncrypted ? decryptSecret(row.webhookSharedSecretEncrypted) || '' : '';
  // Fail closed: when no shared secret is configured we cannot authenticate the
  // caller, so unauthenticated (non-SNS) webhook deliveries must be rejected
  // rather than silently accepted. SNS payloads are verified separately by
  // signature in the route handler and never reach this code path.
  if (!expected) return false;
  return safeCompareSecret(received, expected);
}
