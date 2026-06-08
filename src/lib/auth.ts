import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { APP_ROUTES } from '@/lib/routes';
import { NextResponse } from 'next/server';
import { startCampaignSendQueueWorker } from '@/lib/campaign-send-queue';
import { ensureSenderIdentitySchema } from '@/lib/mail-settings';
import { sanitizeNextPath } from '@/lib/google-oauth';
import { ensurePlatformSettingsSchema } from '@/lib/platform-settings';
import { hasCapability } from '@/lib/permissions';
import { executeSql, queryRow } from '@/lib/sqlite';

export const SESSION_COOKIE = 'mailflow_session';
export const IMPERSONATION_ORIGINAL_COOKIE = 'mailflow_impersonation_original';
export const IMPERSONATION_RETURN_COOKIE = 'mailflow_impersonation_return';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const DEFAULT_ADMIN_EMAIL_ALLOWLIST = ['amit.rai@celnet.in', 'puneet.mehrotra@celnet.in'];

function getSessionSecret() {
  const secret = process.env.AUTH_SECRET || 'dev-insecure-auth-secret-change-in-prod';
  return new TextEncoder().encode(secret);
}

function getAdminEmailAllowlist() {
  const envList = process.env.ADMIN_EMAIL_ALLOWLIST || '';
  return new Set(
    [...DEFAULT_ADMIN_EMAIL_ALLOWLIST, ...envList.split(',')]
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmailAllowed(email: string) {
  return getAdminEmailAllowlist().has(email.trim().toLowerCase());
}

type SessionPayload = {
  userId: string;
  email: string;
  impersonation?: boolean;
};

export type AuthUser = {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  dailyEmailLimit: number;
  imageUploadLimitKb: number | null;
  senderFromName: string | null;
  senderFromEmail: string | null;
  senderReplyToEmail: string | null;
  lastLoginAt: Date | null;
};

export type ImpersonationContext = {
  returnTo: string;
  originalUser: {
    userId: string;
    email: string;
    name: string | null;
    role: string;
  };
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function createProvisionedPasswordHash() {
  return hashPassword(randomUUID() + randomUUID());
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSessionSecret());
}

export async function readSessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    if (typeof payload.userId !== 'string' || typeof payload.email !== 'string') {
      return null;
    }

    return {
      userId: payload.userId,
      email: payload.email,
      impersonation: payload.impersonation === true,
    };
  } catch {
    return null;
  }
}

async function getUserRecordFromSession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return getUserRecordFromToken(token || null);
}

async function getUserRecordFromToken(token: string | null) {
  ensurePlatformSettingsSchema();
  ensureSenderIdentitySchema();
  startCampaignSendQueueWorker();

  if (!token) return null;

  const session = await readSessionToken(token);
  if (!session) return null;

  const user = queryRow<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    isActive: number | boolean;
    dailyEmailLimit: number;
    imageUploadLimitKb: number | null;
    senderFromName: string | null;
    senderFromEmail: string | null;
    senderReplyToEmail: string | null;
    lastLoginAt: string | null;
  }>(
    'SELECT id, email, name, role, "isActive", "dailyEmailLimit", "imageUploadLimitKb", "senderFromName", "senderFromEmail", "senderReplyToEmail", "lastLoginAt" FROM "User" WHERE id = ? LIMIT 1',
    [session.userId],
  );

  if (!user) return null;
  if (!Boolean(user.isActive) && !session.impersonation) return null;

  if (isAdminEmailAllowed(user.email) && user.role !== 'ADMIN') {
    executeSql('UPDATE "User" SET role = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?', ['ADMIN', user.id]);
    user.role = 'ADMIN';
  }

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: Boolean(user.isActive),
    dailyEmailLimit: user.dailyEmailLimit,
    imageUploadLimitKb: user.imageUploadLimitKb ?? null,
    senderFromName: user.senderFromName ?? null,
    senderFromEmail: user.senderFromEmail ?? null,
    senderReplyToEmail: user.senderReplyToEmail ?? null,
    lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt) : null,
  } satisfies AuthUser;
}

export async function getCurrentUserFromCookies() {
  return getUserRecordFromSession();
}

export async function getImpersonationContextFromCookies(): Promise<ImpersonationContext | null> {
  const originalToken = cookies().get(IMPERSONATION_ORIGINAL_COOKIE)?.value || null;
  const returnTo = sanitizeNextPath(cookies().get(IMPERSONATION_RETURN_COOKIE)?.value || APP_ROUTES.ADMIN_DASHBOARD);

  if (!originalToken) return null;

  const originalUser = await getUserRecordFromToken(originalToken);
  if (!originalUser) return null;

  return {
    returnTo,
    originalUser: {
      userId: originalUser.userId,
      email: originalUser.email,
      name: originalUser.name,
      role: originalUser.role,
    },
  };
}

export async function getCurrentUserFromRequest(request: Request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  const token = match ? decodeURIComponent(match[1]) : null;
  return getUserRecordFromToken(token);
}

export async function requireUserFromCookies(): Promise<{ user: AuthUser } | { error: NextResponse }> {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { user };
}

export async function requireUserFromRequest(request: Request): Promise<{ user: AuthUser } | { error: NextResponse }> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { user };
}

export async function requireAdminFromCookies(): Promise<{ user: AuthUser } | { error: NextResponse }> {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth;

  if (!hasCapability(auth.user.role, 'manage_users')) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return auth;
}

export async function requireManagerOrAdminFromCookies(): Promise<{ user: AuthUser } | { error: NextResponse }> {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth;

  if (!hasCapability(auth.user.role, 'manage_teams')) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return auth;
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export function setImpersonationCookies(response: NextResponse, originalToken: string, returnTo: string) {
  response.cookies.set({
    name: IMPERSONATION_ORIGINAL_COOKIE,
    value: originalToken,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });

  response.cookies.set({
    name: IMPERSONATION_RETURN_COOKIE,
    value: returnTo,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearImpersonationCookies(response: NextResponse) {
  response.cookies.set({
    name: IMPERSONATION_ORIGINAL_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set({
    name: IMPERSONATION_RETURN_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
