import { ok } from '@/lib/http';
import { startOfUtcDay } from '@/lib/quota';
import { ensureManagerSchema, requireManagerOrAdminFromCookies } from '@/lib/manager';
import { recordResourceMetric } from '@/lib/resource-analytics';
import { queryRows } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  ensureManagerSchema();

  const auth = await requireManagerOrAdminFromCookies();
  if ('error' in auth) return auth.error;

  const from = startOfUtcDay();
  const managerId = auth.user.userId;

  recordResourceMetric({
    scopeType: 'GLOBAL',
    eventType: 'PAGE_VIEW',
    userId: auth.user.userId,
    note: 'manager_overview',
  });

  const teams = queryRows<{
    id: string;
    name: string;
    description: string | null;
    dailyCreditLimit: number;
    managerId: string;
    createdAt: string;
    updatedAt: string;
    memberCount: number;
    allocatedCredits: number;
  }>(
    `
      SELECT
        t.id,
        t.name,
        t.description,
        t."dailyCreditLimit",
        t."managerId",
        t."createdAt",
        t."updatedAt",
        (SELECT COUNT(*) FROM "TeamMember" tm WHERE tm."teamId" = t.id) as memberCount,
        COALESCE((SELECT SUM(tm."allocatedDailyLimit") FROM "TeamMember" tm WHERE tm."teamId" = t.id), 0) as allocatedCredits
      FROM "Team" t
      WHERE t."managerId" = ?
      ORDER BY t."createdAt" DESC
    `,
    [managerId],
  );

  const teamIds = teams.map((team) => team.id);
  const teamIdSet = new Set(teamIds);

  const memberRows = teamIds.length
    ? queryRows<{
        teamId: string;
        memberId: string;
        email: string;
        name: string | null;
        role: string;
        isActive: number | boolean;
        dailyEmailLimit: number;
        lastLoginAt: string | null;
        createdAt: string;
        allocatedDailyLimit: number;
      }>(
        `
          SELECT
            tm."teamId" as "teamId",
            tm."userId" as memberId,
            u.email,
            u.name,
            u.role,
            u."isActive",
            u."dailyEmailLimit",
            u."lastLoginAt",
            u."createdAt",
            tm."allocatedDailyLimit"
          FROM "TeamMember" tm
          INNER JOIN "User" u ON u.id = tm."userId"
          WHERE tm."teamId" IN (${teamIds.map(() => '?').join(', ')})
          ORDER BY u."createdAt" DESC
        `,
        teamIds,
      )
    : [];

  const recentCampaignRows = teamIds.length
    ? queryRows<{
        teamId: string;
        campaignId: string;
        campaignName: string;
        subject: string;
        status: string;
        provider: string | null;
        sentCount: number;
        failedCount: number;
        skippedCount: number;
        createdAt: string;
        startedAt: string | null;
        finishedAt: string | null;
        durationSeconds: number | null;
        ownerEmail: string;
      }>(
        `
          SELECT
            tm."teamId" as "teamId",
            c.id as "campaignId",
            c.name as campaignName,
            c.subject,
            c.status,
            c.provider,
            c."sentCount",
            c."failedCount",
            c."skippedCount",
            c."createdAt",
            c."startedAt",
            c."finishedAt",
            c."durationSeconds",
            u.email as ownerEmail
          FROM "Campaign" c
          INNER JOIN "User" u ON u.id = c."userId"
          INNER JOIN "TeamMember" tm ON tm."userId" = c."userId"
          WHERE tm."teamId" IN (${teamIds.map(() => '?').join(', ')})
          ORDER BY c."createdAt" DESC
          LIMIT 40
        `,
        teamIds,
      )
    : [];

  const sentTodayRows = teamIds.length
    ? queryRows<{ teamId: string; count: number }>(
        `
          SELECT tm."teamId" as "teamId", COUNT(*) as count
          FROM "Event" e
          INNER JOIN "Campaign" c ON c.id = e."campaignId"
          INNER JOIN "TeamMember" tm ON tm."userId" = c."userId"
          WHERE e.type = 'SENT' AND e."createdAt" >= ? AND tm."teamId" IN (${teamIds.map(() => '?').join(', ')})
          GROUP BY tm."teamId"
        `,
        [from.toISOString(), ...teamIds],
      )
    : [];

  const eventRows = teamIds.length
    ? queryRows<{ teamId: string; type: string; count: number }>(
        `
          SELECT tm."teamId" as "teamId", e.type as type, COUNT(*) as count
          FROM "Event" e
          INNER JOIN "Campaign" c ON c.id = e."campaignId"
          INNER JOIN "TeamMember" tm ON tm."userId" = c."userId"
          WHERE tm."teamId" IN (${teamIds.map(() => '?').join(', ')})
          GROUP BY tm."teamId", e.type
        `,
        teamIds,
      )
    : [];

  const sentTodayByTeam = new Map<string, number>(sentTodayRows.map((row) => [row.teamId, row.count]));
  const eventByTeam = new Map<string, Record<string, number>>();
  for (const row of eventRows) {
    if (!teamIdSet.has(row.teamId)) continue;
    if (!eventByTeam.has(row.teamId)) eventByTeam.set(row.teamId, {});
    eventByTeam.get(row.teamId)![row.type] = row.count;
  }

  const teamsWithDetails = teams.map((team) => {
    const members = memberRows.filter((row) => row.teamId === team.id).map((row) => ({
      memberId: row.memberId,
      email: row.email,
      name: row.name,
      role: row.role,
      isActive: Boolean(row.isActive),
      dailyEmailLimit: row.dailyEmailLimit,
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      allocatedDailyLimit: row.allocatedDailyLimit,
    }));

    const recentCampaigns = recentCampaignRows
      .filter((row) => row.teamId === team.id)
      .map((row) => ({
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        subject: row.subject,
        status: row.status,
        provider: row.provider,
        sentCount: row.sentCount,
        failedCount: row.failedCount,
        skippedCount: row.skippedCount,
        createdAt: row.createdAt,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        durationSeconds: row.durationSeconds,
        ownerEmail: row.ownerEmail,
      }));

    const events = eventByTeam.get(team.id) || {};
    const sentToday = sentTodayByTeam.get(team.id) || 0;
    const allocatedCredits = Number(team.allocatedCredits || 0);
    const remainingCredits = Math.max(0, team.dailyCreditLimit - allocatedCredits);
    const openTotal = events.OPENED || 0;
    const bounceTotal = events.BOUNCED || 0;
    const unsubscribeTotal = events.UNSUBSCRIBED || 0;
    const sentTotal = events.SENT || 0;

    return {
      ...team,
      memberCount: Number(team.memberCount || 0),
      allocatedCredits,
      remainingCredits,
      sentToday,
      sentTotal,
      openTotal,
      bounceTotal,
      unsubscribeTotal,
      openRate: sentTotal > 0 ? (openTotal / sentTotal) * 100 : 0,
      bounceRate: sentTotal > 0 ? (bounceTotal / sentTotal) * 100 : 0,
      unsubscribeRate: sentTotal > 0 ? (unsubscribeTotal / sentTotal) * 100 : 0,
      members,
      recentCampaigns,
    };
  });

  const totals = teamsWithDetails.reduce(
    (acc, team) => {
      acc.teams += 1;
      acc.members += team.memberCount;
      acc.dailyCredits += team.dailyCreditLimit;
      acc.allocatedCredits += team.allocatedCredits;
      acc.sentToday += team.sentToday;
      acc.sentTotal += team.sentTotal;
      acc.openTotal += team.openTotal;
      acc.bounceTotal += team.bounceTotal;
      acc.unsubscribeTotal += team.unsubscribeTotal;
      return acc;
    },
    { teams: 0, members: 0, dailyCredits: 0, allocatedCredits: 0, sentToday: 0, sentTotal: 0, openTotal: 0, bounceTotal: 0, unsubscribeTotal: 0 },
  );

  const selectedTeamId = teamsWithDetails[0]?.id || null;

  return ok({
    totals: {
      ...totals,
      openRate: totals.sentTotal > 0 ? (totals.openTotal / totals.sentTotal) * 100 : 0,
      bounceRate: totals.sentTotal > 0 ? (totals.bounceTotal / totals.sentTotal) * 100 : 0,
      unsubscribeRate: totals.sentTotal > 0 ? (totals.unsubscribeTotal / totals.sentTotal) * 100 : 0,
    },
    teams: teamsWithDetails,
    selectedTeamId,
  });
}
