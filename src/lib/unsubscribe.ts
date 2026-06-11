import { SignJWT, jwtVerify } from 'jose';

const UNSUBSCRIBE_TTL_SECONDS = 60 * 60 * 24 * 365;
const UNSUBSCRIBE_PURPOSE_TEST = 'test';
const UNSUBSCRIBE_PURPOSE_LIVE = 'unsubscribe';

function getSecret() {
  const secret = process.env.AUTH_SECRET || 'dev-insecure-auth-secret-change-in-prod';
  return new TextEncoder().encode(secret);
}

export type UnsubscribePayload = {
  kind?: typeof UNSUBSCRIBE_PURPOSE_TEST | typeof UNSUBSCRIBE_PURPOSE_LIVE;
  userId: string;
  campaignId?: string;
  contactId?: string;
  email?: string;
};

export type UnsubscribeToken = {
  kind: typeof UNSUBSCRIBE_PURPOSE_TEST | typeof UNSUBSCRIBE_PURPOSE_LIVE;
  userId: string;
  campaignId: string | null;
  contactId: string | null;
  email: string | null;
};

export async function createUnsubscribeToken(payload: UnsubscribePayload) {
  return new SignJWT({
    ...payload,
    kind: payload.kind || UNSUBSCRIBE_PURPOSE_LIVE,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${UNSUBSCRIBE_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function readUnsubscribeToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const kind = payload.kind === UNSUBSCRIBE_PURPOSE_TEST ? UNSUBSCRIBE_PURPOSE_TEST : UNSUBSCRIBE_PURPOSE_LIVE;
    if (typeof payload.userId !== 'string') {
      return null;
    }

    if (kind === UNSUBSCRIBE_PURPOSE_LIVE && (
      typeof payload.campaignId !== 'string' ||
      typeof payload.contactId !== 'string' ||
      typeof payload.email !== 'string'
    )) {
      return null;
    }

    return {
      kind,
      userId: payload.userId,
      campaignId: typeof payload.campaignId === 'string' ? payload.campaignId : null,
      contactId: typeof payload.contactId === 'string' ? payload.contactId : null,
      email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
    };
  } catch {
    return null;
  }
}
