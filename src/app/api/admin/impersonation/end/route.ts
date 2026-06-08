import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  clearImpersonationCookies,
  clearSessionCookie,
  createSessionToken,
  getCurrentUserFromCookies,
  getImpersonationContextFromCookies,
  IMPERSONATION_ORIGINAL_COOKIE,
  setSessionCookie,
} from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { sanitizeNextPath } from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const context = await getImpersonationContextFromCookies();
  const currentUser = await getCurrentUserFromCookies();
  const hasOriginalCookie = Boolean(cookies().get(IMPERSONATION_ORIGINAL_COOKIE)?.value);

  const returnTo = context?.returnTo || '/dashboard/admin';

  if (!context) {
    if (hasOriginalCookie) {
      const response = NextResponse.redirect(new URL('/login', request.url));
      clearImpersonationCookies(response);
      clearSessionCookie(response);
      return response;
    }

    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (!currentUser) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    clearImpersonationCookies(response);
    clearSessionCookie(response);
    return response;
  }

  await recordAuditEvent({
    actorUserId: context.originalUser.userId,
    actorEmail: context.originalUser.email,
    actorRole: context.originalUser.role,
    action: 'impersonation_end',
    entityType: 'User',
    entityId: currentUser.userId,
    scopeType: 'GLOBAL',
    metadata: {
      currentEmail: currentUser.email,
      currentRole: currentUser.role,
    },
  });

  const restoredToken = await createSessionToken({
    userId: context.originalUser.userId,
    email: context.originalUser.email,
  });

  const response = NextResponse.redirect(new URL(sanitizeNextPath(returnTo), request.url));
  clearImpersonationCookies(response);
  setSessionCookie(response, restoredToken);
  return response;
}
