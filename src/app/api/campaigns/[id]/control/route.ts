import { requireUserFromCookies } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { controlCampaignSendJob } from '@/lib/campaign-send-queue';

type Params = { params: { id: string } };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  const action = String((body as { action?: string } | null)?.action || '').trim().toLowerCase();
  if (!['pause', 'resume', 'cancel'].includes(action)) {
    return fail('action must be pause, resume, or cancel.', 400);
  }

  try {
    const result = controlCampaignSendJob(auth.user.userId, params.id, action as 'pause' | 'resume' | 'cancel');
    await recordAuditEvent({
      actorUserId: auth.user.userId,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: `campaign_${action}`,
      entityType: 'Campaign',
      entityId: params.id,
      scopeType: 'SELF',
      metadata: {
        jobId: result.jobId,
        status: result.status,
      },
    });
    return ok({
      success: true,
      action,
      jobId: result.jobId,
      status: result.status,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Campaign control failed.', 400);
  }
}
