import { queryRows } from '@/lib/sqlite';

export async function getUserAnalyticsSummary(userId: string, options?: { campaignId?: string; listId?: string; from?: Date | null; to?: Date | null; }) {
  const filters: string[] = ['c.userId = ?'];
  const params: unknown[] = [userId];

  if (options?.campaignId) {
    filters.push('c.id = ?');
    params.push(options.campaignId);
  }

  if (options?.listId) {
    filters.push('c.listId = ?');
    params.push(options.listId);
  }

  if (options?.from) {
    filters.push('e.createdAt >= ?');
    params.push(options.from.toISOString());
  }

  if (options?.to) {
    filters.push('e.createdAt <= ?');
    params.push(options.to.toISOString());
  }

  const eventRows = queryRows<{ type: string; count: number }>(
    `
      SELECT e.type as type, COUNT(*) as count
      FROM "Event" e
      INNER JOIN "Campaign" c ON c.id = e.campaignId
      WHERE ${filters.join(' AND ')}
      GROUP BY e.type
    `,
    params,
  );

  const counts = { SENT: 0, DELIVERED: 0, OPENED: 0, CLICKED: 0, BOUNCED: 0, UNSUBSCRIBED: 0 };

  for (const row of eventRows) {
    if (row.type in counts) counts[row.type as keyof typeof counts] = row.count;
  }

  const sent = counts.SENT;
  const delivered = counts.DELIVERED;
  const opened = counts.OPENED;
  const clicked = counts.CLICKED;
  const bounced = counts.BOUNCED;
  const unsubscribed = counts.UNSUBSCRIBED;

  return {
    sent,
    delivered,
    opened,
    clicked,
    bounced,
    unsubscribed,
    openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
    clickRate: delivered > 0 ? (clicked / delivered) * 100 : 0,
    bounceRate: sent > 0 ? (bounced / sent) * 100 : 0,
    unsubscribeRate: delivered > 0 ? (unsubscribed / delivered) * 100 : 0,
  };
}
