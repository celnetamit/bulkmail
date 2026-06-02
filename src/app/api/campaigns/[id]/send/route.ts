import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { queueCampaignSendJob } from '@/lib/campaign-send-queue';

type Params = { params: { id: string } };

export async function POST(_: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  try {
    const job = queueCampaignSendJob(auth.user.userId, params.id);
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
    return fail(error instanceof Error ? error.message : 'Campaign send failed.', 400);
  }
}

