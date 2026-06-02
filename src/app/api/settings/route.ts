import { requireUserFromCookies } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { getMailSettings, saveMailSettings } from '@/lib/mail-settings';
import { getPlatformSettings, savePlatformSettings } from '@/lib/platform-settings';
import { hasCapability } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  if (!hasCapability(auth.user.role, 'manage_settings')) {
    return fail('Mail Provider settings are admin-only.', 403);
  }

  const settings = await getMailSettings(auth.user.userId);
  const platformSettings = await getPlatformSettings();
  return ok({
    settings: {
      ...settings,
      imageUploadLimitKb: platformSettings.imageUploadLimitKb,
      imageUploadSource: platformSettings.source,
      sendingDomain: platformSettings.sendingDomain,
      spfVerified: platformSettings.spfVerified,
      dkimVerified: platformSettings.dkimVerified,
      dmarcVerified: platformSettings.dmarcVerified,
    },
  });
}

export async function PUT(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  if (!hasCapability(auth.user.role, 'manage_settings')) {
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

  const imageUploadLimitKbRaw = 'imageUploadLimitKb' in body ? Number((body as Record<string, unknown>).imageUploadLimitKb) : undefined;
  const sendingDomain = 'sendingDomain' in body ? String((body as Record<string, unknown>).sendingDomain || '').trim() : undefined;
  const spfVerified = 'spfVerified' in body ? Boolean((body as Record<string, unknown>).spfVerified) : undefined;
  const dkimVerified = 'dkimVerified' in body ? Boolean((body as Record<string, unknown>).dkimVerified) : undefined;
  const dmarcVerified = 'dmarcVerified' in body ? Boolean((body as Record<string, unknown>).dmarcVerified) : undefined;
  if (imageUploadLimitKbRaw !== undefined) {
    const imageUploadLimitKb = Number.isFinite(imageUploadLimitKbRaw) && imageUploadLimitKbRaw > 0 ? Math.floor(imageUploadLimitKbRaw) : 50;
    await savePlatformSettings({
      imageUploadLimitKb,
      sendingDomain,
      spfVerified,
      dkimVerified,
      dmarcVerified,
    });
  } else if (sendingDomain !== undefined || spfVerified !== undefined || dkimVerified !== undefined || dmarcVerified !== undefined) {
    const platformSettings = await getPlatformSettings();
    await savePlatformSettings({
      imageUploadLimitKb: platformSettings.imageUploadLimitKb,
      sendingDomain,
      spfVerified,
      dkimVerified,
      dmarcVerified,
    });
  }

  await recordAuditEvent({
    actorUserId: auth.user.userId,
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    action: 'settings_update',
    entityType: 'PlatformSettings',
    entityId: 'global',
    scopeType: 'GLOBAL',
    metadata: {
      provider,
      imageUploadLimitKb: imageUploadLimitKbRaw,
      sendingDomain,
      spfVerified,
      dkimVerified,
      dmarcVerified,
    },
  });

  const settings = await getMailSettings(auth.user.userId);
  const platformSettings = await getPlatformSettings();
  return ok({
    settings: {
      ...settings,
      imageUploadLimitKb: platformSettings.imageUploadLimitKb,
      imageUploadSource: platformSettings.source,
      sendingDomain: platformSettings.sendingDomain,
      spfVerified: platformSettings.spfVerified,
      dkimVerified: platformSettings.dkimVerified,
      dmarcVerified: platformSettings.dmarcVerified,
    },
    saved: provider,
  });
}
