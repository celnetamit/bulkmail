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
  if (!expected) {
    // Fail closed in production: when no shared secret is configured we cannot
    // authenticate the caller, so unauthenticated (non-SNS) webhook deliveries
    // must be rejected rather than silently accepted. SNS payloads are verified
    // separately by signature in the route handler and never reach this path.
    //
    // Outside production we accept unsigned deliveries so local development and
    // the API smoke test can exercise the webhook ingest path without a secret,
    // matching the documented `.env` contract ("leave blank to accept test
    // webhook payloads without a secret").
    return process.env.NODE_ENV !== 'production';
  }
  return safeCompareSecret(received, expected);
}
