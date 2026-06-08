import { NextResponse } from 'next/server';
import { requireUserFromCookies } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { recordSystemEvent } from '@/lib/observability';
import { fail, ok } from '@/lib/http';
import { queueCampaignSendJob } from '@/lib/campaign-send-queue';
import { analyzeCampaignRisk } from '@/lib/campaign-risk';

type Params = { params: { id: string } };

export async function GET(_: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const risk = await analyzeCampaignRisk(auth.user.userId, params.id);
  if (!risk) return fail('Campaign not found.', 404);

  return ok({ risk });
}

export async function POST(_: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  try {
    const risk = await analyzeCampaignRisk(auth.user.userId, params.id);
    if (!risk) return fail('Campaign not found.', 404);
    if (risk.status === 'blocked') {
      return NextResponse.json(
        {
          error: `Campaign risk check blocked sending: ${risk.summary}`,
          risk,
        },
        { status: 400 },
      );
    }

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
        riskStatus: risk.status,
        riskScore: risk.score,
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
