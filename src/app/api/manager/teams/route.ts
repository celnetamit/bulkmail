import { fail, ok } from '@/lib/http';
import { ensureManagerSchema, requireManagerOrAdminFromCookies } from '@/lib/manager';
import { recordAuditEvent } from '@/lib/audit';
import { executeSql, queryRow, queryRows } from '@/lib/sqlite';

type TeamRow = {
  id: string;
  name: string;
  description: string | null;
  dailyCreditLimit: number;
  managerId: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  allocatedCredits: number;
};

async function loadTeams(managerId: string) {
  const teams = queryRows<TeamRow>(
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

  return teams.map((team) => ({
    ...team,
    memberCount: Number(team.memberCount || 0),
    allocatedCredits: Number(team.allocatedCredits || 0),
    remainingCredits: Math.max(0, team.dailyCreditLimit - Number(team.allocatedCredits || 0)),
  }));
}

export async function GET() {
  ensureManagerSchema();

  const auth = await requireManagerOrAdminFromCookies();
  if ('error' in auth) return auth.error;

  const teams = await loadTeams(auth.user.userId);
  return ok({ teams });
}

export async function POST(request: Request) {
  ensureManagerSchema();

  const auth = await requireManagerOrAdminFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  const name = typeof body === 'object' && body && 'name' in body ? String((body as Record<string, unknown>).name || '').trim() : '';
  const description = typeof body === 'object' && body && 'description' in body ? String((body as Record<string, unknown>).description || '').trim() : '';
  const dailyCreditLimitRaw = typeof body === 'object' && body && 'dailyCreditLimit' in body ? Number((body as Record<string, unknown>).dailyCreditLimit) : 100000;
  const dailyCreditLimit = Number.isFinite(dailyCreditLimitRaw) && dailyCreditLimitRaw > 0 ? Math.floor(dailyCreditLimitRaw) : 100000;

  if (!name) return fail('Team name is required.', 400);

  const id = crypto.randomUUID().replace(/-/g, '');
  const createdAt = new Date().toISOString();
  executeSql(
    `
      INSERT INTO "Team" (id, name, description, "dailyCreditLimit", "managerId", "createdAt", "updatedAt")
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [id, name, description || null, dailyCreditLimit, auth.user.userId, createdAt, createdAt],
  );

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'team_create',
    entityType: 'Team',
    entityId: id,
    scopeType: 'TEAM',
    metadata: {
      name,
      description: description || null,
      dailyCreditLimit,
    },
  });

  const team = queryRow<TeamRow>(
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
      WHERE t.id = ?
      LIMIT 1
    `,
    [id],
  );

  return ok({ team }, 201);
}
