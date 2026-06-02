import { createProvisionedPasswordHash } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { isValidEmailAddress, normalizeEmailAddress } from '@/lib/email-address';
import { ensureManagerSchema, requireManagerOrAdminFromCookies } from '@/lib/manager';
import { executeSql, queryRow } from '@/lib/sqlite';

type Params = { params: { id: string } };

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

function loadMemberAllocation(teamId: string, userId: string) {
  return queryRow<{ userId: string; allocatedDailyLimit: number; teamId: string }>(
    'SELECT userId, allocatedDailyLimit, teamId FROM "TeamMember" WHERE teamId = ? AND userId = ? LIMIT 1',
    [teamId, userId],
  );
}

export async function POST(request: Request, { params }: Params) {
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

  const email = typeof body === 'object' && body && 'email' in body ? normalizeEmailAddress(String((body as Record<string, unknown>).email || '')) : '';
  const name = typeof body === 'object' && body && 'name' in body ? String((body as Record<string, unknown>).name || '').trim() : '';
  const dailyEmailLimitRaw = typeof body === 'object' && body && 'dailyEmailLimit' in body ? Number((body as Record<string, unknown>).dailyEmailLimit) : 100000;
  const dailyEmailLimit = Number.isFinite(dailyEmailLimitRaw) && dailyEmailLimitRaw > 0 ? Math.floor(dailyEmailLimitRaw) : 100000;

  if (!email) return fail('Email is required.', 400);
  if (!isValidEmailAddress(email)) return fail('Invalid email address.', 400);

  const existingUser = queryRow<{ id: string; role: string; dailyEmailLimit: number }>(
    'SELECT id, role, dailyEmailLimit FROM "User" WHERE email = ? LIMIT 1',
    [email],
  );
  if (existingUser && existingUser.role !== 'USER') {
    return fail('Only USER accounts can be assigned to teams.', 400);
  }

  const existingMembership = existingUser ? loadMemberAllocation(params.id, existingUser.id) : null;
  if (existingMembership) {
    return fail('This user already belongs to this team.', 409);
  }

  const currentAllocation = Number(team.allocatedCredits || 0);
  if (currentAllocation + dailyEmailLimit > team.dailyCreditLimit) {
    return fail('Team credit limit would be exceeded.', 400);
  }

  let userId = existingUser?.id;
  if (!existingUser) {
    userId = crypto.randomUUID().replace(/-/g, '');
    const now = new Date().toISOString();
    const passwordHash = await createProvisionedPasswordHash();
    executeSql(
      `
        INSERT INTO "User" (
          id, email, name, password, role, isActive, dailyEmailLimit, lastLoginAt, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [userId, email, name || null, passwordHash, 'USER', 1, dailyEmailLimit, null, now, now],
    );
  } else {
    executeSql(
      'UPDATE "User" SET name = COALESCE(?, name), "dailyEmailLimit" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?',
      [name || null, dailyEmailLimit, existingUser.id],
    );
  }

  const now = new Date().toISOString();
  executeSql(
    `
      INSERT INTO "TeamMember" (id, teamId, userId, allocatedDailyLimit, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [crypto.randomUUID().replace(/-/g, ''), team.id, userId, dailyEmailLimit, now, now],
  );

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'team_member_assign',
    entityType: 'TeamMember',
    entityId: userId,
    scopeType: 'TEAM',
    metadata: {
      teamId: team.id,
      email,
      dailyEmailLimit,
    },
  });

  const member = queryRow(
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
    [team.id, userId],
  );

  return ok({ member }, 201);
}
