import { requireUserFromCookies } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { recordSystemEvent } from '@/lib/observability';
import { fail, ok } from '@/lib/http';
import { executeSql, queryRow } from '@/lib/sqlite';
import { isCampaignLockedForEditing } from '@/lib/campaign-send-queue';

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const existing = queryRow<{ id: string; status: string }>(
    'SELECT id, status FROM "Campaign" WHERE id = ? AND "userId" = ? LIMIT 1',
    [params.id, auth.user.userId],
  );
  if (!existing) return fail('Campaign not found.', 404);
  if (isCampaignLockedForEditing(existing.status)) {
    return fail('Cannot reset a sent, queued, retrying, paused, or sending campaign.', 409);
  }

  let wipeEvents = false;
  try {
    const body = await request.json().catch(() => ({}));
    wipeEvents = !!(body && (body as any).wipeEvents);
  } catch {}

  try {
    // Remove any queued/send jobs for this campaign and reset campaign counters/timestamps.
    executeSql('DELETE FROM "CampaignSendJob" WHERE "campaignId" = ?', [params.id]);

    if (wipeEvents) {
      executeSql('DELETE FROM "Event" WHERE "campaignId" = ?', [params.id]);
    }

    executeSql(
      `UPDATE "Campaign" SET
        "provider" = NULL,
        "totalRecipients" = 0,
        "sentCount" = 0,
        "failedCount" = 0,
        "skippedCount" = 0,
        "quotaSkippedCount" = 0,
        "remainingToday" = 0,
        "startedAt" = NULL,
        "finishedAt" = NULL,
        "durationSeconds" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ? AND "userId" = ?`,
      [params.id, auth.user.userId],
    );

    await recordAuditEvent({
      actorUserId: auth.user.userId,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'campaign_reset',
      entityType: 'Campaign',
      entityId: params.id,
      scopeType: 'SELF',
    });

    recordSystemEvent({
      level: 'INFO',
      source: 'campaign_reset',
      message: 'Campaign reset to fresh state',
      userId: auth.user.userId,
      campaignId: params.id,
      details: { route: '/api/campaigns/[id]/reset' },
    });

    return ok({ success: true });
  } catch (error) {
    console.error('campaign_reset_failed', { campaignId: params.id, error: error instanceof Error ? error.message : String(error) });
    recordSystemEvent({
      level: 'ERROR',
      source: 'campaign_reset',
      message: error instanceof Error ? error.message : 'Campaign reset failed',
      userId: auth.user.userId,
      campaignId: params.id,
    });
    return fail('Failed to reset campaign.', 500);
  }
}
