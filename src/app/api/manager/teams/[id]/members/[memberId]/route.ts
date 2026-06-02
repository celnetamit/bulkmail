import { fail, ok } from '@/lib/http';
import { recordAuditEvent } from '@/lib/audit';
import { ensureManagerSchema, requireManagerOrAdminFromCookies } from '@/lib/manager';
import { executeSql, queryRow } from '@/lib/sqlite';

type Params = { params: { id: string; memberId: string } };

function loadTeam(teamId: string, managerId: string) {
  return queryRow<{ id: string; name: string; dailyCreditLimit: number; allocatedCredits: number }>(
    `
      SELECT
        t.id,
        t.name,
        t.dailyCreditLimit,
        COALESCE((SELECT SUM(tm.allocatedDailyLimit) FROM "TeamMember" tm WHERE tm.teamId = t.id), 0) as allocatedCredits
      FROM "Team" t
      WHERE t.id = ? AND t.managerId = ?
      LIMIT 1
    `,
    [teamId, managerId],
  );
}

function loadMember(teamId: string, userId: string) {
  return queryRow<{
    memberId: string;
    teamId: string;
    allocatedDailyLimit: number;
    email: string;
    name: string | null;
    role: string;
    isActive: number | boolean;
    dailyEmailLimit: number;
    lastLoginAt: string | null;
    createdAt: string;
  }>(
    `
      SELECT
        tm.userId as memberId,
        tm.teamId,
        tm.allocatedDailyLimit,
        u.email,
        u.name,
        u.role,
        u.isActive,
        u.dailyEmailLimit,
        u.lastLoginAt,
        u.createdAt
      FROM "TeamMember" tm
      INNER JOIN "User" u ON u.id = tm.userId
      WHERE tm.teamId = ? AND tm.userId = ?
      LIMIT 1
    `,
    [teamId, userId],
  );
}

export async function PATCH(request: Request, { params }: Params) {
  ensureManagerSchema();

  const auth = await requireManagerOrAdminFromCookies();
  if ('error' in auth) return auth.error;

  const team = loadTeam(params.id, auth.user.userId);
  if (!team) return fail('Team not found.', 404);

  const member = loadMember(params.id, params.memberId);
  if (!member) return fail('Team member not found.', 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  const name = typeof body === 'object' && body && 'name' in body ? String((body as Record<string, unknown>).name || '').trim() : undefined;
  const isActive = typeof body === 'object' && body && 'isActive' in body ? Boolean((body as Record<string, unknown>).isActive) : undefined;
  const dailyEmailLimitRaw = typeof body === 'object' && body && 'dailyEmailLimit' in body ? Number((body as Record<string, unknown>).dailyEmailLimit) : undefined;
  const dailyEmailLimit = dailyEmailLimitRaw !== undefined && Number.isFinite(dailyEmailLimitRaw) && dailyEmailLimitRaw > 0 ? Math.floor(dailyEmailLimitRaw) : undefined;

  const nextLimit = dailyEmailLimit ?? member.allocatedDailyLimit;
  const nextTeamAllocated = Number(team.allocatedCredits || 0) - Number(member.allocatedDailyLimit || 0) + nextLimit;
  if (nextTeamAllocated > team.dailyCreditLimit) {
    return fail('Team credit limit would be exceeded.', 400);
  }

  const updates: string[] = [];
  const paramsList: unknown[] = [];
  if (name !== undefined) {
    updates.push('"name" = ?');
    paramsList.push(name || null);
  }
  if (isActive !== undefined) {
    updates.push('"isActive" = ?');
    paramsList.push(isActive ? 1 : 0);
  }
  if (dailyEmailLimit !== undefined) {
    updates.push('"dailyEmailLimit" = ?');
    paramsList.push(dailyEmailLimit);
  }

  if (!updates.length) return fail('No changes provided.', 400);

  if (dailyEmailLimit !== undefined || name !== undefined || isActive !== undefined) {
    executeSql(
      `UPDATE "User" SET ${updates.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
      [...paramsList, member.memberId],
    );
  }

  if (dailyEmailLimit !== undefined) {
    executeSql(
      `
        UPDATE "TeamMember"
        SET "allocatedDailyLimit" = ?, "updatedAt" = CURRENT_TIMESTAMP
        WHERE teamId = ? AND userId = ?
      `,
      [dailyEmailLimit, params.id, params.memberId],
    );
  }

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'team_member_update',
    entityType: 'TeamMember',
    entityId: params.memberId,
    scopeType: 'TEAM',
    metadata: {
      teamId: params.id,
      changedFields: [
        ...(name !== undefined ? ['name'] : []),
        ...(isActive !== undefined ? ['isActive'] : []),
        ...(dailyEmailLimit !== undefined ? ['dailyEmailLimit'] : []),
      ],
    },
  });

  const updated = loadMember(params.id, params.memberId);
  return ok({ member: updated });
}

export async function DELETE(request: Request, { params }: Params) {
  ensureManagerSchema();

  const auth = await requireManagerOrAdminFromCookies();
  if ('error' in auth) return auth.error;

  const team = loadTeam(params.id, auth.user.userId);
  if (!team) return fail('Team not found.', 404);

  const member = loadMember(params.id, params.memberId);
  if (!member) return fail('Team member not found.', 404);

  executeSql(
    `
      UPDATE "User"
      SET "dailyEmailLimit" = 100000,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [params.memberId],
  );
  executeSql('DELETE FROM "TeamMember" WHERE teamId = ? AND userId = ?', [params.id, params.memberId]);

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'team_member_remove',
    entityType: 'TeamMember',
    entityId: params.memberId,
    scopeType: 'TEAM',
    metadata: {
      teamId: params.id,
    },
  });

  return ok({ success: true });
}
