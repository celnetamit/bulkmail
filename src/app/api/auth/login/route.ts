import { createSessionToken, setSessionCookie, verifyPassword } from '@/lib/auth';
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

  if (!email || !password) {
    return fail('Email and password are required.', 400);
  }

  const user = queryRow<{
    id: string;
    email: string;
    password: string;
    name: string | null;
    role: string;
    isActive: number | boolean;
  }>('SELECT id, email, password, name, role, isActive FROM "User" WHERE email = ? LIMIT 1', [email]);

  if (!user) {
    return fail('Invalid credentials.', 401);
  }

  if (!Boolean(user.isActive)) {
    return fail('Your account is disabled.', 403);
  }

  const validPassword = await verifyPassword(password, user.password);
  if (!validPassword) {
    return fail('Invalid credentials.', 401);
  }

  executeSql('UPDATE "User" SET lastLoginAt = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

  const token = await createSessionToken({ userId: user.id, email: user.email });
  const response = ok({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  setSessionCookie(response, token);
  return response;
}
