import { requireAdminFromCookies, hashPassword } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow } from '@/lib/sqlite';

type Params = { params: { id: string } };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdminFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  const name = typeof body === 'object' && body && 'name' in body ? String((body as Record<string, unknown>).name || '').trim() : undefined;
  const role = typeof body === 'object' && body && 'role' in body ? String((body as Record<string, unknown>).role || '').trim().toUpperCase() : undefined;
  const isActive = typeof body === 'object' && body && 'isActive' in body ? Boolean((body as Record<string, unknown>).isActive) : undefined;
  const password = typeof body === 'object' && body && 'password' in body ? String((body as Record<string, unknown>).password || '') : '';
  const dailyEmailLimitRaw = typeof body === 'object' && body && 'dailyEmailLimit' in body ? Number((body as Record<string, unknown>).dailyEmailLimit) : undefined;
  const dailyEmailLimit = dailyEmailLimitRaw !== undefined && Number.isFinite(dailyEmailLimitRaw) && dailyEmailLimitRaw > 0 ? Math.floor(dailyEmailLimitRaw) : undefined;

  const existing = queryRow<{ id: string }>('SELECT id FROM "User" WHERE id = ? LIMIT 1', [params.id]);
  if (!existing) return fail('User not found.', 404);

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name || null;
  if (role !== undefined) {
    if (!['ADMIN', 'USER'].includes(role)) return fail('Invalid role.', 400);
    data.role = role;
  }
  if (isActive !== undefined) data.isActive = isActive;
  if (dailyEmailLimit !== undefined) data.dailyEmailLimit = dailyEmailLimit;
  if (password) {
    if (password.length < 8) return fail('Password must be at least 8 characters.', 400);
    data.password = await hashPassword(password);
  }

  if (Object.keys(data).length === 0) {
    return fail('No changes provided.', 400);
  }

  const assignments: string[] = [];
  const paramsList: unknown[] = [];
  if (data.name !== undefined) { assignments.push('"name" = ?'); paramsList.push(data.name); }
  if (data.role !== undefined) { assignments.push('"role" = ?'); paramsList.push(data.role); }
  if (data.isActive !== undefined) { assignments.push('"isActive" = ?'); paramsList.push(data.isActive ? 1 : 0); }
  if (data.dailyEmailLimit !== undefined) { assignments.push('"dailyEmailLimit" = ?'); paramsList.push(data.dailyEmailLimit); }
  if (data.password !== undefined) { assignments.push('"password" = ?'); paramsList.push(data.password); }

  executeSql(
    `UPDATE "User" SET ${assignments.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
    [...paramsList, params.id],
  );

  const user = queryRow(
    'SELECT id, email, name, role, isActive, dailyEmailLimit, createdAt, lastLoginAt FROM "User" WHERE id = ? LIMIT 1',
    [params.id],
  );

  return ok({ user });
}
