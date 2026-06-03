import { createRemoteJWKSet, jwtVerify } from 'jose';
import { NextResponse } from 'next/server';
import { createProvisionedPasswordHash, createSessionToken, isAdminEmailAllowed, setSessionCookie } from '@/lib/auth';
import { executeSql, queryRow } from '@/lib/sqlite';
import { getAppOrigin, getGoogleClientId, getGoogleClientSecret, getGoogleRedirectUri, sanitizeNextPath } from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function redirectToLogin(request: Request, error: string) {
  return NextResponse.redirect(new URL(`/login?error=${error}`, getAppOrigin(request)));
}

export async function GET(request: Request) {
  const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const stateCookie = request.headers.get('cookie')?.match(/(?:^|;\s*)google_oauth_state=([^;]+)/)?.[1];
  const nextCookie = request.headers.get('cookie')?.match(/(?:^|;\s*)google_oauth_next=([^;]+)/)?.[1];

  if (error) {
    return redirectToLogin(request, 'auth_failed');
  }

  if (!code || !state || !stateCookie || stateCookie !== state) {
    return redirectToLogin(request, 'auth_failed');
  }

  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  if (!clientId || !clientSecret) {
    return redirectToLogin(request, 'google_missing');
  }
  const origin = getAppOrigin(request);

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getGoogleRedirectUri(origin),
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    return redirectToLogin(request, 'auth_failed');
  }

  const tokenData = (await tokenResponse.json()) as { id_token?: string };
  if (!tokenData.id_token) {
    return redirectToLogin(request, 'auth_failed');
  }

  let payload: { email?: string; email_verified?: boolean; name?: string };
  try {
    const verified = await jwtVerify(tokenData.id_token, GOOGLE_JWKS, {
      audience: clientId,
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
    });
    payload = verified.payload as typeof payload;
  } catch {
    return redirectToLogin(request, 'auth_failed');
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!email || !payload.email_verified) {
    return redirectToLogin(request, 'auth_failed');
  }

  const user = queryRow<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    isActive: number | boolean;
  }>('SELECT id, email, name, role, "isActive" FROM "User" WHERE email = ? LIMIT 1', [email]);

  if (!user) {
    if (!isAdminEmailAllowed(email)) {
      return redirectToLogin(request, 'not_provisioned');
    }

    const id = crypto.randomUUID().replace(/-/g, '');
    const createdAt = new Date().toISOString();
    const passwordHash = await createProvisionedPasswordHash();
    executeSql(
      `
        INSERT INTO "User" (
          id, email, name, password, role, "isActive", "dailyEmailLimit", "lastLoginAt", "createdAt", "updatedAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [id, email, null, passwordHash, 'ADMIN', 1, 100000, null, createdAt, createdAt],
    );

    const provisionedUser = queryRow<{
      id: string;
      email: string;
      name: string | null;
      role: string;
      isActive: number | boolean;
    }>('SELECT id, email, name, role, "isActive" FROM "User" WHERE id = ? LIMIT 1', [id]);

    if (!provisionedUser) {
      return redirectToLogin(request, 'auth_failed');
    }

    const token = await createSessionToken({ userId: provisionedUser.id, email: provisionedUser.email });
    const nextPath = sanitizeNextPath(nextCookie ? decodeURIComponent(nextCookie) : null);
    const response = NextResponse.redirect(new URL(nextPath, origin));
    setSessionCookie(response, token);
    response.cookies.set('google_oauth_state', '', { path: '/', maxAge: 0 });
    response.cookies.set('google_oauth_next', '', { path: '/', maxAge: 0 });
    return response;
  }

  if (!Boolean(user.isActive)) {
    return redirectToLogin(request, 'disabled');
  }

  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (name && !user.name) {
    executeSql('UPDATE "User" SET name = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?', [name, user.id]);
  }

  if (isAdminEmailAllowed(email) && user.role !== 'ADMIN') {
    executeSql('UPDATE "User" SET role = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?', ['ADMIN', user.id]);
  }

  const token = await createSessionToken({ userId: user.id, email: user.email });
  const nextPath = sanitizeNextPath(nextCookie ? decodeURIComponent(nextCookie) : null);
  const response = NextResponse.redirect(new URL(nextPath, origin));
  setSessionCookie(response, token);
  response.cookies.set('google_oauth_state', '', { path: '/', maxAge: 0 });
  response.cookies.set('google_oauth_next', '', { path: '/', maxAge: 0 });
  return response;
}
