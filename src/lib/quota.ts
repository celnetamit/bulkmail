import { queryRow } from '@/lib/sqlite';

export function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function getUserDailySentCount(userId: string, from = startOfUtcDay()) {
  const result = queryRow<{ count: number }>(
    `
      SELECT COUNT(*) as count
      FROM "Event" e
      INNER JOIN "Campaign" c ON c.id = e.campaignId
      WHERE e.type = ? AND e.createdAt >= ? AND c.userId = ?
    `,
    ['SENT', from.toISOString(), userId],
  );

  return result?.count || 0;
}

export async function getUserQuotaStatus(userId: string, dailyLimit: number) {
  const sentToday = await getUserDailySentCount(userId);
  const remainingToday = Math.max(0, dailyLimit - sentToday);
  const usagePct = dailyLimit > 0 ? Math.min(100, (sentToday / dailyLimit) * 100) : 0;

  return {
    sentToday,
    remainingToday,
    dailyLimit,
    usagePct,
  };
}
