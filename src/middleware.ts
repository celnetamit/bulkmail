import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'mailflow_session';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const protectedDashboard = pathname.startsWith('/dashboard');
  const protectedApi =
    pathname.startsWith('/api/lists') ||
    pathname.startsWith('/api/contacts') ||
    pathname.startsWith('/api/templates') ||
    pathname.startsWith('/api/campaigns') ||
    pathname.startsWith('/api/analytics') ||
    pathname.startsWith('/api/settings') ||
    pathname.startsWith('/api/admin');

  if (!protectedDashboard && !protectedApi) {
    return NextResponse.next();
  }

  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasSessionCookie) {
    return NextResponse.next();
  }

  if (protectedApi) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/lists/:path*',
    '/api/contacts/:path*',
    '/api/templates/:path*',
    '/api/campaigns/:path*',
    '/api/analytics/:path*',
    '/api/settings/:path*',
    '/api/admin/:path*',
  ],
};
