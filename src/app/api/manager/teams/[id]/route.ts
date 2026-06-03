import { fail, ok } from '@/lib/http';
import { ensureManagerSchema, requireManagerOrAdminFromCookies } from '@/lib/manager';
import { recordAuditEvent } from '@/lib/audit';
import { executeSql, queryRow } from '@/lib/sqlite';

type Params = { params: { id: string } };

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

function loadTeam(teamId: string, managerId: string) {
  return queryRow<TeamRow>(
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
      WHERE t.id = ? AND t."managerId" = ?
      LIMIT 1
    `,
    [teamId, managerId],
  );
}

export async function GET(request: Request, { params }: Params) {
  ensureManagerSchema();

  const auth = await requireManagerOrAdminFromCookies();
  if ('error' in auth) return auth.error;

  const team = loadTeam(params.id, auth.user.userId);
  if (!team) return fail('Team not found.', 404);

  const members = queryRow<{ count: number }>('SELECT COUNT(*) as count FROM "TeamMember" WHERE "teamId" = ?', [team.id])?.count || 0;
  return ok({ team: { ...team, memberCount: Number(members || team.memberCount), allocatedCredits: Number(team.allocatedCredits || 0) } });
}

export async function PATCH(request: Request, { params }: Params) {
  ensureManagerSchema();

  const auth = await requireManagerOrAdminFromCookies();
  if ('error' in auth) return auth.error;

  const team = loadTeam(params.id, auth.user.userId);
  if (!team) return fail('Team not found.', 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  const name = typeof body === 'object' && body && 'name' in body ? String((body as Record<string, unknown>).name || '').trim() : undefined;
  const description = typeof body === 'object' && body && 'description' in body ? String((body as Record<string, unknown>).description || '').trim() : undefined;
  const dailyCreditLimitRaw = typeof body === 'object' && body && 'dailyCreditLimit' in body ? Number((body as Record<string, unknown>).dailyCreditLimit) : undefined;
  const dailyCreditLimit = dailyCreditLimitRaw !== undefined && Number.isFinite(dailyCreditLimitRaw) && dailyCreditLimitRaw > 0 ? Math.floor(dailyCreditLimitRaw) : undefined;

  if (dailyCreditLimit !== undefined && dailyCreditLimit < Number(team.allocatedCredits || 0)) {
    return fail('Team credit limit cannot be lower than allocated credits.', 400);
  }

  const assignments: string[] = [];
  const paramsList: unknown[] = [];
  if (name !== undefined) { assignments.push('"name" = ?'); paramsList.push(name || team.name); }
  if (description !== undefined) { assignments.push('"description" = ?'); paramsList.push(description || null); }
  if (dailyCreditLimit !== undefined) { assignments.push('"dailyCreditLimit" = ?'); paramsList.push(dailyCreditLimit); }

  if (!assignments.length) return fail('No changes provided.', 400);

  executeSql(
    `UPDATE "Team" SET ${assignments.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ? AND "managerId" = ?`,
    [...paramsList, params.id, auth.user.userId],
  );

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'team_update',
    entityType: 'Team',
    entityId: params.id,
    scopeType: 'TEAM',
    metadata: {
      changedFields: [
        ...(name !== undefined ? ['name'] : []),
        ...(description !== undefined ? ['description'] : []),
        ...(dailyCreditLimit !== undefined ? ['dailyCreditLimit'] : []),
      ],
    },
  });

  const updated = loadTeam(params.id, auth.user.userId);
  return ok({ team: updated });
}

export async function DELETE(request: Request, { params }: Params) {
  ensureManagerSchema();

  const auth = await requireManagerOrAdminFromCookies();
  if ('error' in auth) return auth.error;

  const team = loadTeam(params.id, auth.user.userId);
  if (!team) return fail('Team not found.', 404);

  const memberRows = queryRow<{ count: number }>('SELECT COUNT(*) as count FROM "TeamMember" WHERE "teamId" = ?', [team.id])?.count || 0;
  if (memberRows > 0) {
    executeSql(
      `
        UPDATE "User"
        SET "dailyEmailLimit" = 100000, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id IN (SELECT "userId" FROM "TeamMember" WHERE "teamId" = ?)
      `,
      [team.id],
    );
  }

  executeSql('DELETE FROM "TeamMember" WHERE "teamId" = ?', [team.id]);
  executeSql('DELETE FROM "Team" WHERE id = ? AND "managerId" = ?', [params.id, auth.user.userId]);

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'team_delete',
    entityType: 'Team',
    entityId: params.id,
    scopeType: 'TEAM',
    metadata: {
      memberCount: team.memberCount,
    },
  });

  return ok({ success: true });
}
