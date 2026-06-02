import { requireUserFromCookies } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { queryRows } from '@/lib/sqlite';
import { getCampaignLists } from '@/lib/campaign-lists';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseIds(raw: string | null) {
  return Array.from(new Set((raw || '').split(',').map((value) => value.trim()).filter(Boolean)));
}

function placeholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ');
}

export async function GET(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const url = new URL(request.url);
  const campaignIds = parseIds(url.searchParams.get('campaignIds') || url.searchParams.get('ids'));
  if (campaignIds.length === 0) {
    return fail('Select at least one campaign to export.', 400);
  }

  const campaigns = queryRows<{
    id: string;
    name: string;
    subject: string;
    bodyHtml: string;
    status: string;
    provider: string | null;
    isArchived: number | boolean;
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
    templateName: string | null;
  }>(
    `
      SELECT
        c.id,
        c.name,
        c.subject,
        c.bodyHtml,
        c.status,
        c.provider,
        CASE WHEN COALESCE(c.isArchived, FALSE) THEN 1 ELSE 0 END as isArchived,
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
        l.name as listName,
        t.name as templateName
      FROM "Campaign" c
      INNER JOIN "List" l ON l.id = c.listId
      LEFT JOIN "Template" t ON t.id = c.templateId
      WHERE c.userId = ? AND c.id IN (${placeholders(campaignIds.length)})
    `,
    [auth.user.userId, ...campaignIds],
  );

  if (campaigns.length !== campaignIds.length) {
    return fail('One or more campaigns were not found.', 404);
  }

  const listsByCampaign = new Map<string, { id: string; name: string; isDefaultTestList: number | boolean }[]>();
  for (const campaignId of campaignIds) {
    listsByCampaign.set(campaignId, getCampaignLists(campaignId, auth.user.userId));
  }

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'campaign_export',
    entityType: 'Campaign',
    entityId: campaignIds[0],
    scopeType: 'SELF',
    metadata: { campaignIds, count: campaignIds.length },
  });

  return ok({
    exportedAt: new Date().toISOString(),
    campaigns: campaignIds.map((campaignId) => {
      const campaign = campaigns.find((entry) => entry.id === campaignId);
      return campaign
        ? {
            ...campaign,
            list: { id: campaign.listId, name: campaign.listName },
            lists: listsByCampaign.get(campaignId) || [{ id: campaign.listId, name: campaign.listName, isDefaultTestList: false }],
            template: campaign.templateId ? { id: campaign.templateId, name: campaign.templateName || '' } : null,
          }
        : null;
    }).filter(Boolean),
  });
}
