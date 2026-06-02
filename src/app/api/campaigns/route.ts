import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { queryRow, queryRows, executeSql } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const campaigns = queryRows<{
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
      WHERE c.userId = ?
      ORDER BY c.createdAt DESC
    `,
    [auth.user.userId],
  );

  const rows = queryRows<{
    campaignId: string;
    type: string;
    count: number;
  }>(
    `
      SELECT e.campaignId as campaignId, e.type as type, COUNT(*) as count
      FROM "Event" e
      INNER JOIN "Campaign" c ON c.id = e.campaignId
      WHERE c.userId = ?
      GROUP BY e.campaignId, e.type
    `,
    [auth.user.userId],
  );

  const byCampaign = new Map<string, Record<string, number>>();

  for (const row of rows) {
    if (!byCampaign.has(row.campaignId)) byCampaign.set(row.campaignId, {});
    byCampaign.get(row.campaignId)![row.type] = row.count;
  }

  const campaignsWithStats = campaigns.map((campaign: any) => {
      const counts = byCampaign.get(campaign.id) || {};
      return {
        ...campaign,
        list: { id: campaign.listId, name: campaign.listName },
        template: campaign.templateId ? { id: campaign.templateId, name: campaign.templateName || '' } : null,
        openedCount: counts.OPENED || 0,
        deliveredCount: counts.DELIVERED || 0,
        bouncedCount: counts.BOUNCED || 0,
        unsubscribedCount: counts.UNSUBSCRIBED || 0,
      };
    });

  return ok({ campaigns: campaignsWithStats });
}

export async function POST(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try { body = await request.json(); } catch { return fail('Invalid JSON body.', 400); }

  const name = typeof body === 'object' && body && 'name' in body ? String((body as Record<string, unknown>).name).trim() : '';
  const listId = typeof body === 'object' && body && 'listId' in body ? String((body as Record<string, unknown>).listId).trim() : '';
  const subject = typeof body === 'object' && body && 'subject' in body ? String((body as Record<string, unknown>).subject).trim() : '';
  const bodyHtml = typeof body === 'object' && body && 'bodyHtml' in body ? String((body as Record<string, unknown>).bodyHtml).trim() : '';
  const templateIdRaw = typeof body === 'object' && body && 'templateId' in body ? String((body as Record<string, unknown>).templateId || '').trim() : '';
  const templateId = templateIdRaw || null;

  if (!name || !listId || !subject || !bodyHtml) return fail('name, listId, subject and bodyHtml are required.', 400);

  const list = queryRow<{ id: string }>(
    'SELECT id FROM "List" WHERE id = ? AND userId = ? LIMIT 1',
    [listId, auth.user.userId],
  );
  if (!list) return fail('List not found.', 404);

  if (templateId) {
    const template = queryRow<{ id: string }>(
      'SELECT id FROM "Template" WHERE id = ? AND userId = ? LIMIT 1',
      [templateId, auth.user.userId],
    );
    if (!template) return fail('Template not found.', 404);
  }

  const id = crypto.randomUUID().replace(/-/g, '');
  const createdAt = new Date().toISOString();
  const updatedAt = createdAt;

  executeSql(
    `
      INSERT INTO "Campaign" (
        id, name, subject, bodyHtml, status, provider,
        totalRecipients, sentCount, failedCount, skippedCount,
        startedAt, finishedAt, durationSeconds,
        userId, listId, templateId, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      name,
      subject,
      bodyHtml,
      'DRAFT',
      null,
      0,
      0,
      0,
      0,
      null,
      null,
      null,
      auth.user.userId,
      listId,
      templateId,
      createdAt,
      updatedAt,
    ],
  );

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
  }>('SELECT * FROM "Campaign" WHERE id = ? LIMIT 1', [id]);

  return ok({ campaign }, 201);
}
