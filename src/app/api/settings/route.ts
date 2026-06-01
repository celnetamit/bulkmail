import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { getMailSettings, saveMailSettings } from '@/lib/mail-settings';

export async function GET() {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  if (auth.user.role !== 'ADMIN') {
    return fail('Mail Provider settings are admin-only.', 403);
  }

  const settings = await getMailSettings(auth.user.userId);
  return ok({ settings });
}

export async function PUT(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  if (auth.user.role !== 'ADMIN') {
    return fail('Mail Provider settings are admin-only.', 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  if (!body || typeof body !== 'object') {
    return fail('Settings payload is required.', 400);
  }

  const provider = 'provider' in body ? String((body as Record<string, unknown>).provider).trim() : '';
  if (!provider) return fail('provider is required.', 400);

  await saveMailSettings(auth.user.userId, {
    provider,
    awsRegion: 'awsRegion' in body ? String((body as Record<string, unknown>).awsRegion || '').trim() : undefined,
    awsFromEmail: 'awsFromEmail' in body ? String((body as Record<string, unknown>).awsFromEmail || '').trim() : undefined,
    awsAccessKeyId: 'awsAccessKeyId' in body ? String((body as Record<string, unknown>).awsAccessKeyId || '').trim() : undefined,
    awsSecretAccessKey: 'awsSecretAccessKey' in body ? String((body as Record<string, unknown>).awsSecretAccessKey || '').trim() : undefined,
    awsSessionToken: 'awsSessionToken' in body ? String((body as Record<string, unknown>).awsSessionToken || '').trim() : undefined,
    resendApiKey: 'resendApiKey' in body ? String((body as Record<string, unknown>).resendApiKey || '').trim() : undefined,
    resendFromEmail: 'resendFromEmail' in body ? String((body as Record<string, unknown>).resendFromEmail || '').trim() : undefined,
    webhookSharedSecret: 'webhookSharedSecret' in body ? String((body as Record<string, unknown>).webhookSharedSecret || '').trim() : undefined,
  });

  return ok({ settings: await getMailSettings(auth.user.userId), saved: provider });
}
