import { SignJWT, jwtVerify } from 'jose';

const UNSUBSCRIBE_TTL_SECONDS = 60 * 60 * 24 * 365;

function getSecret() {
  const secret = process.env.AUTH_SECRET || 'dev-insecure-auth-secret-change-in-prod';
  return new TextEncoder().encode(secret);
}

export type UnsubscribePayload = {
  userId: string;
  campaignId: string;
  contactId: string;
  email: string;
};

export async function createUnsubscribeToken(payload: UnsubscribePayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${UNSUBSCRIBE_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function readUnsubscribeToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.campaignId !== 'string' ||
      typeof payload.contactId !== 'string' ||
      typeof payload.email !== 'string'
    ) {
      return null;
    }

    return {
      userId: payload.userId,
      campaignId: payload.campaignId,
      contactId: payload.contactId,
      email: payload.email.toLowerCase(),
    };
  } catch {
    return null;
  }
}
