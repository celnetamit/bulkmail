import type { AuthUser } from '@/lib/auth';
import { ensureManagerSchema } from '@/lib/manager';
import { queryRows } from '@/lib/sqlite';

export type DataScopeKind = 'GLOBAL' | 'TEAM' | 'SELF';

export type DataScope = {
  scope: DataScopeKind;
  clause: string;
  params: unknown[];
  userIds: string[] | null;
};

export function getAccessibleUserIdsForRole(userId: string, role: string) {
  const normalizedRole = String(role || 'USER').toUpperCase();

  if (normalizedRole === 'ADMIN') {
    return null;
  }

  if (normalizedRole === 'MANAGER') {
    ensureManagerSchema();
    const managedUsers = queryRows<{ userId: string }>(
      `
        SELECT DISTINCT tm.userId as userId
        FROM "Team" t
        INNER JOIN "TeamMember" tm ON tm.teamId = t.id
        WHERE t.managerId = ?
      `,
      [userId],
    ).map((row) => row.userId);

    return Array.from(new Set([userId, ...managedUsers]));
  }

  return [userId];
}

export function buildOwnerScopeForRole(userId: string, role: string, ownerExpression: string): DataScope {
  const normalizedRole = String(role || 'USER').toUpperCase();
  const userIds = getAccessibleUserIdsForRole(userId, normalizedRole);

  if (userIds === null) {
    return {
      scope: 'GLOBAL',
      clause: '1=1',
      params: [],
      userIds: null,
    };
  }

  return {
    scope: normalizedRole === 'MANAGER' ? 'TEAM' : 'SELF',
    clause: userIds.length > 0 ? `${ownerExpression} IN (${userIds.map(() => '?').join(', ')})` : '1=0',
    params: userIds,
    userIds,
  };
}

export function buildOwnerScope(user: AuthUser, ownerExpression: string) {
  return buildOwnerScopeForRole(user.userId, user.role, ownerExpression);
}

export function isOwnedByViewer(ownerUserId: string, user: AuthUser) {
  return ownerUserId === user.userId;
}
