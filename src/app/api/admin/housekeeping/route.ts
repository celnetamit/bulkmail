import { requireAdminFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import {
  getHousekeepingSettings,
  getHousekeepingSnapshot,
  mapActionToScopes,
  recordHousekeepingAudit,
  runHousekeeping,
  saveHousekeepingSettings,
} from '@/lib/housekeeping';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RequestAction =
  | 'full'
  | 'auditLogs'
  | 'systemEvents'
  | 'sendJobs'
  | 'archiveCampaigns'
  | 'purgeArchivedCampaigns';

export async function GET() {
  const auth = await requireAdminFromCookies();
  if ('error' in auth) return auth.error;

  const settings = getHousekeepingSettings();
  const snapshot = getHousekeepingSnapshot(settings);
  return ok({ settings, snapshot });
}

export async function PUT(request: Request) {
  const auth = await requireAdminFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  if (!body || typeof body !== 'object') {
    return fail('Housekeeping settings payload is required.', 400);
  }

  const payload = body as Record<string, unknown>;
  const settings = saveHousekeepingSettings({
    isEnabled: typeof payload.isEnabled === 'boolean' ? payload.isEnabled : undefined,
    runEveryMinutes: 'runEveryMinutes' in payload ? Number(payload.runEveryMinutes) : undefined,
    auditLogRetentionDays: 'auditLogRetentionDays' in payload ? Number(payload.auditLogRetentionDays) : undefined,
    systemEventRetentionDays:
      'systemEventRetentionDays' in payload ? Number(payload.systemEventRetentionDays) : undefined,
    sendJobRetentionDays: 'sendJobRetentionDays' in payload ? Number(payload.sendJobRetentionDays) : undefined,
    autoArchiveCampaignDays:
      'autoArchiveCampaignDays' in payload ? Number(payload.autoArchiveCampaignDays) : undefined,
    archivedCampaignRetentionDays:
      'archivedCampaignRetentionDays' in payload ? Number(payload.archivedCampaignRetentionDays) : undefined,
  });

  await recordHousekeepingAudit(
    {
      userId: auth.user.userId,
      email: auth.user.email,
      role: auth.user.role,
    },
    'housekeeping_settings_update',
    null,
    settings,
  );

  return ok({
    settings,
    snapshot: getHousekeepingSnapshot(settings),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const action = String(payload.action || 'full') as RequestAction;
  const force = 'force' in payload ? Boolean(payload.force) : true;
  const result = await runHousekeeping({
    triggeredBy: auth.user.email,
    mode: 'manual',
    force,
    scopes: mapActionToScopes(action),
  });

  await recordHousekeepingAudit(
    {
      userId: auth.user.userId,
      email: auth.user.email,
      role: auth.user.role,
    },
    action === 'full' ? 'housekeeping_run_manual' : `housekeeping_run_${action}`,
    result.summary,
  );

  return ok(result);
}
