import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { sendTestEmail } from '@/lib/providers/email';
import { isValidEmailAddress, normalizeEmailAddress } from '@/lib/email-address';

export async function POST(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  if (!body || typeof body !== 'object') {
    return fail('Test email payload is required.', 400);
  }

  const toEmail = 'toEmail' in body ? normalizeEmailAddress(String((body as Record<string, unknown>).toEmail || '')) : '';
  const subject = 'subject' in body ? String((body as Record<string, unknown>).subject || '').trim() : '';
  const bodyHtml = 'bodyHtml' in body ? String((body as Record<string, unknown>).bodyHtml || '').trim() : '';

  if (!toEmail || !subject || !bodyHtml) {
    return fail('toEmail, subject, and bodyHtml are required.', 400);
  }
  if (!isValidEmailAddress(toEmail)) {
    return fail('Invalid email address.', 400);
  }

  const result = await sendTestEmail(auth.user.userId, {
    toEmail,
    subject,
    bodyHtml,
  });

  return ok({ success: true, ...result });
}
