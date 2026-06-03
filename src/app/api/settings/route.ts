import { requireUserFromCookies } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { getMailSettings, getSenderIdentity, saveMailSettings, saveSenderIdentity } from '@/lib/mail-settings';
import { getPlatformSettings, savePlatformSettings } from '@/lib/platform-settings';
import { hasCapability } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const canManageSettings = hasCapability(auth.user.role, 'manage_settings');
  const senderIdentity = await getSenderIdentity(auth.user.userId);

  if (!canManageSettings) {
    return ok({ senderIdentity });
  }

  const settings = await getMailSettings(auth.user.userId);
  const platformSettings = await getPlatformSettings();
  return ok({
    senderIdentity,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  if (!body || typeof body !== 'object') {
    return fail('Settings payload is required.', 400);
  }
  const payload = body as Record<string, unknown>;
  const canManageSettings = hasCapability(auth.user.role, 'manage_settings');

  const senderIdentity = await saveSenderIdentity(auth.user.userId, {
    senderFromEmail: 'senderFromEmail' in payload ? String(payload.senderFromEmail || '') : undefined,
    senderReplyToEmail: 'senderReplyToEmail' in payload ? String(payload.senderReplyToEmail || '') : undefined,
  });

  if (!canManageSettings) {
    await recordAuditEvent({
      actorUserId: auth.user.userId,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'settings_update',
      entityType: 'UserSenderIdentity',
      entityId: auth.user.userId,
      scopeType: 'SELF',
      metadata: {
        senderFromEmail: senderIdentity.senderFromEmail || null,
        senderReplyToEmail: senderIdentity.senderReplyToEmail || null,
      },
    });
    return ok({ senderIdentity, saved: 'sender-identity' });
  }

  const provider = 'provider' in payload ? String(payload.provider).trim() : '';
  if (!provider) return fail('provider is required.', 400);

  await saveMailSettings(auth.user.userId, {
    provider,
    awsRegion: 'awsRegion' in payload ? String(payload.awsRegion || '').trim() : undefined,
    awsFromEmail: 'awsFromEmail' in payload ? String(payload.awsFromEmail || '').trim() : undefined,
    awsAccessKeyId: 'awsAccessKeyId' in payload ? String(payload.awsAccessKeyId || '').trim() : undefined,
    awsSecretAccessKey: 'awsSecretAccessKey' in payload ? String(payload.awsSecretAccessKey || '').trim() : undefined,
    awsSessionToken: 'awsSessionToken' in payload ? String(payload.awsSessionToken || '').trim() : undefined,
    resendApiKey: 'resendApiKey' in payload ? String(payload.resendApiKey || '').trim() : undefined,
    resendFromEmail: 'resendFromEmail' in payload ? String(payload.resendFromEmail || '').trim() : undefined,
    webhookSharedSecret: 'webhookSharedSecret' in payload ? String(payload.webhookSharedSecret || '').trim() : undefined,
  });

  const imageUploadLimitKbRaw = 'imageUploadLimitKb' in payload ? Number(payload.imageUploadLimitKb) : undefined;
  const sendingDomain = 'sendingDomain' in payload ? String(payload.sendingDomain || '').trim() : undefined;
  const spfVerified = 'spfVerified' in payload ? Boolean(payload.spfVerified) : undefined;
  const dkimVerified = 'dkimVerified' in payload ? Boolean(payload.dkimVerified) : undefined;
  const dmarcVerified = 'dmarcVerified' in payload ? Boolean(payload.dmarcVerified) : undefined;
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
      senderFromEmail: senderIdentity.senderFromEmail || null,
      senderReplyToEmail: senderIdentity.senderReplyToEmail || null,
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
    senderIdentity,
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
