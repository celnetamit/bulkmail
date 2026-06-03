import { readUnsubscribeToken } from '@/lib/unsubscribe';
import { executeSql, queryRow } from '@/lib/sqlite';

function htmlResponse(title: string, message: string, status = 200) {
  return new Response(
    `<!doctype html>
     <html>
       <head>
         <meta charset="utf-8" />
         <meta name="viewport" content="width=device-width, initial-scale=1" />
         <title>${title}</title>
         <style>
           body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0f172a; color: #e2e8f0; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 24px; }
           main { max-width: 560px; background: rgba(30, 41, 59, 0.85); border: 1px solid #334155; border-radius: 16px; padding: 24px; }
           h1 { margin: 0 0 12px; font-size: 28px; color: #f8fafc; }
           p { margin: 0; line-height: 1.6; color: #cbd5e1; }
         </style>
       </head>
       <body>
         <main>
           <h1>${title}</h1>
           <p>${message}</p>
         </main>
       </body>
     </html>`,
    {
      status,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }
  );
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const payload = token ? await readUnsubscribeToken(token) : null;

  if (!payload) {
    return htmlResponse('Unsubscribe failed', 'The unsubscribe link is invalid or expired.', 400);
  }

  executeSql(
    `
      UPDATE "Contact"
      SET status = 'UNSUBSCRIBED', "updatedAt" = CURRENT_TIMESTAMP
      WHERE lower(email) = lower(?)
        AND "listId" IN (SELECT "id" FROM "List" WHERE "userId" = ?)
    `,
    [payload.email, payload.userId],
  );

  const sourceContact = queryRow<{ id: string }>(
    `
      SELECT c."id"
      FROM "Contact" c
      INNER JOIN "List" l ON l."id" = c."listId"
      WHERE c."id" = ? AND lower(c."email") = lower(?) AND l."userId" = ?
      LIMIT 1
    `,
    [payload.contactId, payload.email, payload.userId],
  );

  if (sourceContact) {
    const providerEventId = `unsubscribe:${payload.campaignId}:${payload.contactId}`;
    executeSql(
      `
        INSERT INTO "Event" (
          "id", "type", "provider", "providerEventId", "providerMessageId",
          "contactId", "campaignId", "createdAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT("providerEventId") DO UPDATE SET
          type = excluded.type,
          "providerMessageId" = excluded."providerMessageId"
      `,
      [crypto.randomUUID().replace(/-/g, ''), 'UNSUBSCRIBED', 'unsubscribe-link', providerEventId, null, sourceContact.id, payload.campaignId],
    );
  }

  return htmlResponse('You are unsubscribed', 'Your email address has been removed from future campaign sends.');
}
