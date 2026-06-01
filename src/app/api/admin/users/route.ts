import { requireAdminFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { createProvisionedPasswordHash, isAdminEmailAllowed } from '@/lib/auth';
import { isValidEmailAddress, normalizeEmailAddress } from '@/lib/email-address';
import { executeSql, queryRow, queryRows } from '@/lib/sqlite';

export async function GET() {
  const auth = await requireAdminFromCookies();
  if ('error' in auth) return auth.error;

  const users = queryRows(
    `
      SELECT id, email, name, role, isActive, dailyEmailLimit, lastLoginAt, createdAt
      FROM "User"
      ORDER BY createdAt DESC
    `,
  );

  return ok({ users });
}

export async function POST(request: Request) {
  const auth = await requireAdminFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  const email = typeof body === 'object' && body && 'email' in body ? normalizeEmailAddress(String((body as Record<string, unknown>).email || '')) : '';
  const name = typeof body === 'object' && body && 'name' in body ? String((body as Record<string, unknown>).name || '').trim() : '';
  const role = typeof body === 'object' && body && 'role' in body ? String((body as Record<string, unknown>).role || 'USER').trim().toUpperCase() : 'USER';
  const dailyEmailLimitRaw = typeof body === 'object' && body && 'dailyEmailLimit' in body ? Number((body as Record<string, unknown>).dailyEmailLimit) : 100000;
  const dailyEmailLimit = Number.isFinite(dailyEmailLimitRaw) && dailyEmailLimitRaw > 0 ? Math.floor(dailyEmailLimitRaw) : 100000;

  if (!email) return fail('email is required.', 400);
  if (!isValidEmailAddress(email)) return fail('Invalid email address.', 400);
  if (!['ADMIN', 'USER'].includes(role)) return fail('Invalid role.', 400);

  const existing = queryRow<{ id: string }>('SELECT id FROM "User" WHERE email = ? LIMIT 1', [email]);
  if (existing) return fail('Email is already registered.', 409);

  const id = crypto.randomUUID().replace(/-/g, '');
  const passwordHash = await createProvisionedPasswordHash();
  const createdAt = new Date().toISOString();
  const effectiveRole = isAdminEmailAllowed(email) ? 'ADMIN' : role;
  executeSql(
    `
      INSERT INTO "User" (
        id, email, name, password, role, isActive, dailyEmailLimit, lastLoginAt, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [id, email, name || null, passwordHash, effectiveRole, 1, dailyEmailLimit, null, createdAt, createdAt],
  );

  const user = queryRow(
    'SELECT id, email, name, role, isActive, dailyEmailLimit, createdAt, lastLoginAt FROM "User" WHERE id = ? LIMIT 1',
    [id],
  );

  return ok({ user }, 201);
}
