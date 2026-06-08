import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createSessionToken, requireAdminFromCookies, setImpersonationCookies, setSessionCookie, SESSION_COOKIE } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { fail } from '@/lib/http';
import { sanitizeNextPath } from '@/lib/google-oauth';
import { queryRow } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function readImpersonationTarget(request: Request) {
  const url = new URL(request.url);
  const contentType = request.headers.get('content-type') || '';
  let targetUserId = url.searchParams.get('targetUserId') || url.searchParams.get('userId') || '';
  let nextPath = url.searchParams.get('next') || '/dashboard';
  let returnTo = url.searchParams.get('returnTo') || '/dashboard/admin';

  if (contentType.includes('application/json')) {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      targetUserId = String(body.targetUserId || body.userId || targetUserId || '').trim();
      nextPath = String(body.next || nextPath || '/dashboard');
      returnTo = String(body.returnTo || returnTo || '/dashboard/admin');
    } catch {
      return null;
    }
  } else {
    try {
      const form = await request.formData();
      targetUserId = String(form.get('targetUserId') || form.get('userId') || targetUserId || '').trim();
      nextPath = String(form.get('next') || nextPath || '/dashboard');
      returnTo = String(form.get('returnTo') || returnTo || '/dashboard/admin');
    } catch {
      return null;
    }
  }

  return {
    targetUserId,
    nextPath: sanitizeNextPath(nextPath),
    returnTo: sanitizeNextPath(returnTo),
  };
}

export async function POST(request: Request) {
  const auth = await requireAdminFromCookies();
  if ('error' in auth) return auth.error;

  const input = await readImpersonationTarget(request);
  if (!input) return fail('Invalid impersonation request.', 400);
  if (!input.targetUserId) return fail('targetUserId is required.', 400);
  if (input.targetUserId === auth.user.userId) return fail('You are already using this account.', 400);

  const target = queryRow<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    isActive: number | boolean;
  }>(
    'SELECT id, email, name, role, "isActive" FROM "User" WHERE id = ? LIMIT 1',
    [input.targetUserId],
  );

  if (!target) return fail('Target user not found.', 404);

  const originalToken = cookies().get(SESSION_COOKIE)?.value || '';
  if (!originalToken) return fail('Session not available.', 401);

  const impersonationToken = await createSessionToken({
    userId: target.id,
    email: target.email,
    impersonation: true,
  });

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'impersonation_start',
    entityType: 'User',
    entityId: target.id,
    scopeType: 'GLOBAL',
    metadata: {
      targetEmail: target.email,
      targetRole: target.role,
      targetActive: Boolean(target.isActive),
      returnTo: input.returnTo,
      next: input.nextPath,
    },
  });

  const response = NextResponse.redirect(new URL(input.nextPath, request.url));
  setImpersonationCookies(response, originalToken, input.returnTo);
  setSessionCookie(response, impersonationToken);
  return response;
}
