import { decryptSecret } from '@/lib/crypto';
import { queryRow } from '@/lib/sqlite';

export async function verifyWebhookSecret(request: Request) {
  const received = request.headers.get('x-webhook-secret') || '';
  const envExpected = process.env.WEBHOOK_SHARED_SECRET || '';

  if (envExpected) {
    return received === envExpected;
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
  if (!expected) return true;
  return received === expected;
}
