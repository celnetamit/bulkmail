import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { sendTestEmail } from '@/lib/providers/email';
import { queryRow, queryRows } from '@/lib/sqlite';
import { getDefaultTestList } from '@/lib/campaign-lists';

type Params = { params: { id: string } };

export async function POST(_: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const campaign = queryRow<{
    id: string;
    name: string;
    subject: string;
    bodyHtml: string;
    userId: string;
  }>(
    'SELECT id, name, subject, bodyHtml, userId FROM "Campaign" WHERE id = ? AND userId = ? LIMIT 1',
    [params.id, auth.user.userId],
  );

  if (!campaign) return fail('Campaign not found.', 404);

  const testList = getDefaultTestList(auth.user.userId);
  if (!testList) {
    return fail('Create a default test email list first.', 400);
  }

  const contacts = queryRows<{ id: string; email: string }>(
    `
      SELECT id, email
      FROM "Contact"
      WHERE listId = ? AND status = 'SUBSCRIBED'
      ORDER BY createdAt ASC
    `,
    [testList.id],
  );

  if (contacts.length === 0) {
    return fail('Your default test list has no subscribed contacts.', 400);
  }

  const seen = new Set<string>();
  let sentCount = 0;
  let failedCount = 0;
  let provider = 'mock';

  for (const contact of contacts) {
    const email = contact.email.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);

    try {
      const sent = await sendTestEmail(auth.user.userId, {
        toEmail: email,
        subject: campaign.subject,
        bodyHtml: campaign.bodyHtml,
      });
      provider = sent.provider || provider;
      sentCount += 1;
    } catch (error) {
      console.error('campaign_test_send_failed', {
        campaignId: campaign.id,
        contactId: contact.id,
        email,
        error: error instanceof Error ? error.message : String(error),
      });
      failedCount += 1;
    }
  }

  return ok({
    success: true,
    provider,
    sentCount,
    failedCount,
    testList: { id: testList.id, name: testList.name },
  });
}
