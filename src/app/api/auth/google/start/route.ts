import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAppOrigin, getGoogleClientId, getGoogleClientSecret, getGoogleRedirectUri, sanitizeNextPath } from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/login?error=google_missing', request.url));
  }

  const url = new URL(request.url);
  const nextPath = sanitizeNextPath(url.searchParams.get('next'));
  const state = randomUUID();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  const origin = getAppOrigin(request);

  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', getGoogleRedirectUri(origin));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'select_account');
  authUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authUrl);
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  };

  response.cookies.set('google_oauth_state', state, cookieOptions);
  response.cookies.set('google_oauth_next', nextPath, cookieOptions);
  return response;
}
