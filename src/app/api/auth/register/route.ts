import { createSessionToken, hashPassword, setSessionCookie } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow } from '@/lib/sqlite';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  const email =
    typeof body === 'object' && body !== null && 'email' in body
      ? String((body as Record<string, unknown>).email).trim().toLowerCase()
      : '';

  const password =
    typeof body === 'object' && body !== null && 'password' in body
      ? String((body as Record<string, unknown>).password)
      : '';

  const name =
    typeof body === 'object' && body !== null && 'name' in body
      ? String((body as Record<string, unknown>).name || '').trim()
      : '';

  if (!email || !password) {
    return fail('Email and password are required.', 400);
  }

  if (password.length < 8) {
    return fail('Password must be at least 8 characters.', 400);
  }

  const existing = queryRow<{ id: string }>('SELECT id FROM "User" WHERE email = ? LIMIT 1', [email]);
  if (existing) {
    return fail('Email is already registered.', 409);
  }

  const hashedPassword = await hashPassword(password);

  const created = executeSql(
    'INSERT INTO "User" (email, password, name, role, isActive, dailyEmailLimit, lastLoginAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    [email, hashedPassword, name || null, 'USER', 1, 100000],
  );

  const user = queryRow<{ id: string; email: string; name: string | null; role: string }>(
    'SELECT id, email, name, role FROM "User" WHERE rowid = ? LIMIT 1',
    [created.lastrowid],
  );

  if (!user) {
    return fail('Failed to create user.', 500);
  }

  const token = await createSessionToken({ userId: user.id, email: user.email });
  const response = ok({ user }, 201);
  setSessionCookie(response, token);
  return response;
}
