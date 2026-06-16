import { readOpenTrackingToken } from '@/lib/tracking';
import { rateLimit } from '@/lib/rate-limit';
import { executeSql, queryRow } from '@/lib/sqlite';

const TRANSPARENT_GIF = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255,
  33, 249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
]);

function pixelResponse() {
  return new Response(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      'content-type': 'image/gif',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      pragma: 'no-cache',
      expires: '0',
    },
  });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const payload = token ? await readOpenTrackingToken(token) : null;

  if (!payload) {
    return pixelResponse();
  }

  // Throttle repeated hits to the SAME open pixel (keyed by campaign+contact, not
  // by IP — opens are commonly proxied through shared provider IPs). Recording is
  // idempotent, so when throttled we simply return the pixel without re-writing.
  const limit = rateLimit(`open:${payload.campaignId}:${payload.contactId}`, 60, 60_000);
  if (!limit.allowed) {
    return pixelResponse();
  }

  const contact = queryRow<{ id: string }>(
    `
      SELECT c.id
      FROM "Contact" c
      INNER JOIN "List" l ON l.id = c."listId"
      WHERE c.id = ? AND lower(c.email) = lower(?) AND l."userId" = ?
      LIMIT 1
    `,
    [payload.contactId, payload.email, payload.userId],
  );

  if (contact) {
    const providerEventId = `open:${payload.campaignId}:${payload.contactId}`;
    executeSql(
      `
        INSERT INTO "Event" (
          id, type, provider, "providerEventId", "providerMessageId",
          "contactId", "campaignId", "createdAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT("providerEventId") DO UPDATE SET
          type = excluded.type,
          "providerMessageId" = excluded."providerMessageId"
      `,
      [crypto.randomUUID().replace(/-/g, ''), 'OPENED', 'open-pixel', providerEventId, null, contact.id, payload.campaignId],
    );
  }

  return pixelResponse();
}
