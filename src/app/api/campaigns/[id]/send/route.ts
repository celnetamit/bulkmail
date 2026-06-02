import { requireUserFromCookies } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { recordSystemEvent } from '@/lib/observability';
import { fail, ok } from '@/lib/http';
import { queueCampaignSendJob } from '@/lib/campaign-send-queue';

type Params = { params: { id: string } };

export async function POST(_: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  try {
    const job = queueCampaignSendJob(auth.user.userId, params.id);
    await recordAuditEvent({
      actorUserId: auth.user.userId,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'campaign_send',
      entityType: 'Campaign',
      entityId: params.id,
      scopeType: 'SELF',
      metadata: {
        jobId: job.jobId,
        status: job.status,
        listCount: job.listCount,
      },
    });
    return ok(
      {
        success: true,
        queued: true,
        jobId: job.jobId,
        campaignId: job.campaignId,
        status: job.status,
        listCount: job.listCount,
      },
      202,
    );
  } catch (error) {
    console.error('campaign_send_queue_failed', {
      campaignId: params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    recordSystemEvent({
      level: 'ERROR',
      source: 'campaign_send_queue',
      message: error instanceof Error ? error.message : 'Campaign send failed.',
      userId: auth.user.userId,
      campaignId: params.id,
      details: {
        route: '/api/campaigns/[id]/send',
      },
    });
    return fail(error instanceof Error ? error.message : 'Campaign send failed.', 400);
  }
}
