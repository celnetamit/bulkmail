import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { dispatchCampaignEmails } from '@/lib/providers/email';
import { getAppOrigin } from '@/lib/google-oauth';
import { executeSql, queryRow, queryRows } from '@/lib/sqlite';
import { getCampaignLists } from '@/lib/campaign-lists';

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const campaign = queryRow<{
    id: string;
    name: string;
    subject: string;
    bodyHtml: string;
    status: string;
    provider: string | null;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    startedAt: string | null;
    finishedAt: string | null;
    durationSeconds: number | null;
    userId: string;
    listId: string;
    templateId: string | null;
    createdAt: string;
    updatedAt: string;
    listName: string;
  }>(
    `
      SELECT
        c.id,
        c.name,
        c.subject,
        c.bodyHtml,
        c.status,
        c.provider,
        c.totalRecipients,
        c.sentCount,
        c.failedCount,
        c.skippedCount,
        c.startedAt,
        c.finishedAt,
        c.durationSeconds,
        c.userId,
        c.listId,
        c.templateId,
        c.createdAt,
        c.updatedAt,
        l.name as listName
      FROM "Campaign" c
      INNER JOIN "List" l ON l.id = c.listId
      WHERE c.id = ? AND c.userId = ?
      LIMIT 1
    `,
    [params.id, auth.user.userId],
  );

  if (!campaign) return fail('Campaign not found.', 404);
  if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
    return fail('Only DRAFT or SCHEDULED campaigns can be sent.', 400);
  }

  const selectedLists = getCampaignLists(campaign.id, auth.user.userId);
  const listIds = selectedLists.length > 0 ? selectedLists.map((list) => list.id) : [campaign.listId];

  executeSql('UPDATE "Campaign" SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', ['SENDING', campaign.id]);

  const listPlaceholders = listIds.map(() => '?').join(', ');
  const contacts = queryRows<{
    id: string;
    email: string;
    status: string;
  }>(
    `
      SELECT c.id, c.email, c.status
      FROM "Contact" c
      INNER JOIN "List" l ON l.id = c.listId
      WHERE l.id IN (${listPlaceholders}) AND l.userId = ?
      ORDER BY c.createdAt ASC
    `,
    [...listIds, auth.user.userId],
  );

  try {
    const result = await dispatchCampaignEmails(auth.user.userId, {
      userId: auth.user.userId,
      campaignId: campaign.id,
      campaignName: campaign.name,
      subject: campaign.subject,
      bodyHtml: campaign.bodyHtml,
      appUrl: getAppOrigin(request),
      contacts,
    });

    return ok({ success: true, ...result });
  } catch (error) {
    console.error('campaign_send_failed', { campaignId: campaign.id, error: error instanceof Error ? error.message : String(error) });
    executeSql('UPDATE "Campaign" SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', ['FAILED', campaign.id]);
    return fail(error instanceof Error ? error.message : 'Campaign send failed.', 500);
  }
}
