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
import { getAppOrigin, sanitizeNextPath } from '@/lib/google-oauth';
import { APP_ROUTES } from '@/lib/routes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const context = await getImpersonationContextFromCookies();
  const currentUser = await getCurrentUserFromCookies();
  const hasOriginalCookie = Boolean(cookies().get(IMPERSONATION_ORIGINAL_COOKIE)?.value);

  const returnTo = context?.returnTo || APP_ROUTES.ADMIN_DASHBOARD;

  if (!context) {
    if (hasOriginalCookie) {
      const response = NextResponse.redirect(new URL(APP_ROUTES.LOGIN, getAppOrigin(request)));
      clearImpersonationCookies(response);
      clearSessionCookie(response);
      return response;
    }

    return NextResponse.redirect(new URL(APP_ROUTES.DASHBOARD, getAppOrigin(request)));
  }

  if (!currentUser) {
    const response = NextResponse.redirect(new URL(APP_ROUTES.LOGIN, getAppOrigin(request)));
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

  const response = NextResponse.redirect(new URL(sanitizeNextPath(returnTo), getAppOrigin(request)));
  clearImpersonationCookies(response);
  setSessionCookie(response, restoredToken);
  return response;
}
