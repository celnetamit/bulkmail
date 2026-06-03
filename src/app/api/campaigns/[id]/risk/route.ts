import { requireUserFromCookies } from '@/lib/auth';
import { analyzeCampaignRisk } from '@/lib/campaign-risk';
import { fail, ok } from '@/lib/http';

type Params = { params: { id: string } };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_: Request, { params }: Params) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const risk = await analyzeCampaignRisk(auth.user.userId, params.id);
  if (!risk) return fail('Campaign not found.', 404);

  return ok({ risk });
}
