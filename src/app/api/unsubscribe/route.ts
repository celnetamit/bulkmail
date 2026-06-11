import { readUnsubscribeToken } from '@/lib/unsubscribe';
import { executeSql, queryRow } from '@/lib/sqlite';

type HtmlTone = 'success' | 'warning' | 'error';

function htmlResponse(input: { title: string; message: string; status?: number; tone?: HtmlTone; eyebrow?: string; footer?: string }) {
  const status = input.status ?? 200;
  const toneClass = input.tone === 'warning' ? 'status--warning' : input.tone === 'error' ? 'status--error' : 'status--success';
  const statusLabel = input.tone === 'warning' ? 'Test link verified' : input.tone === 'error' ? 'Action failed' : 'Confirmation';
  const footer =
    input.footer ||
    (input.tone === 'warning'
      ? 'This was only a test confirmation page. No contact changes were made.'
      : 'If this was a live send, the contact will not receive future campaign emails.');

  return new Response(
    `<!doctype html>
     <html>
       <head>
         <meta charset="utf-8" />
         <meta name="viewport" content="width=device-width, initial-scale=1" />
         <title>${input.title}</title>
         <style>
           :root {
             --bg-color: #f5f7fb;
             --card-bg: #ffffff;
             --text-color: #0f172a;
             --border-color: #d6e0ee;
             --primary-color: #14b8a6;
             --primary-hover: #0f9f90;
           }
           * { box-sizing: border-box; }
           body {
             margin: 0;
             min-height: 100vh;
             display: grid;
             place-items: center;
             padding: 24px;
             font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
             background:
               radial-gradient(circle at top, rgba(20, 184, 166, 0.08), transparent 34%),
               linear-gradient(180deg, #f8fbff 0%, #f5f7fb 100%);
             color: var(--text-color);
             -webkit-font-smoothing: antialiased;
           }
           main {
             width: min(640px, 100%);
             padding: 1rem;
             border: 1px solid var(--border-color);
             border-radius: 1rem;
             background: rgba(255, 255, 255, 0.86);
             box-shadow: 0 14px 36px -24px rgba(15, 23, 42, 0.32);
             backdrop-filter: blur(10px);
           }
           .card {
             padding: 1.5rem;
             border-radius: 0.9rem;
             border: 1px solid rgba(214, 224, 238, 0.9);
             background: var(--card-bg);
           }
           .eyebrow {
             margin: 0 0 0.55rem;
             color: #64748b;
             font-size: 0.72rem;
             font-weight: 700;
             text-transform: uppercase;
             letter-spacing: 0.12em;
           }
           h1 {
             margin: 0 0 0.65rem;
             font-size: clamp(1.35rem, 2vw, 1.85rem);
             line-height: 1.12;
             color: #0f172a;
             letter-spacing: -0.03em;
           }
           p {
             margin: 0;
             line-height: 1.65;
             color: #475569;
             font-size: 0.95rem;
           }
           .status {
             display: inline-flex;
             align-items: center;
             gap: 0.45rem;
             margin-bottom: 1rem;
             padding: 0.3rem 0.7rem;
             border-radius: 9999px;
             font-size: 0.78rem;
             font-weight: 700;
             letter-spacing: 0.04em;
           }
           .status::before {
             content: '';
             width: 0.45rem;
             height: 0.45rem;
             border-radius: 9999px;
             background: currentColor;
           }
           .status--success {
             background: rgba(20, 184, 166, 0.12);
             color: #0f766e;
           }
           .status--warning {
             background: rgba(245, 158, 11, 0.14);
             color: #b45309;
           }
           .status--error {
             background: rgba(239, 68, 68, 0.12);
             color: #b91c1c;
           }
           .footer {
             margin-top: 1.1rem;
             color: #64748b;
             font-size: 0.8rem;
           }
         </style>
       </head>
       <body>
         <main>
           <div class="card">
             <p class="eyebrow">${input.eyebrow || 'MailFlow'}</p>
             <div class="status ${toneClass}">
               ${statusLabel}
             </div>
             <h1>${input.title}</h1>
             <p>${input.message}</p>
             <p class="footer">${footer}</p>
           </div>
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
    return htmlResponse({
      title: 'Unsubscribe failed',
      message: 'The unsubscribe link is invalid or expired.',
      status: 400,
      tone: 'error',
    });
  }

  if (payload.kind === 'test') {
    return htmlResponse({
      title: 'Test unsubscribe link verified',
      message: payload.email
        ? `This test unsubscribe link works for ${payload.email}. No contacts were unsubscribed.`
        : 'This test unsubscribe link works. No contacts were unsubscribed.',
      tone: 'warning',
    });
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

  return htmlResponse({
    title: 'You are unsubscribed',
    message: 'You’re all set. MailFlow has removed this address from future campaign sends.',
    tone: 'success',
  });
}
