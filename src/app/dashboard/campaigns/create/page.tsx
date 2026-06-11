import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { APP_ROUTES } from '@/lib/routes';
import { queryRow } from '@/lib/sqlite';
import { CampaignCreateClient } from './campaign-create-client';

export const dynamic = 'force-dynamic';

export default async function CampaignCreatePage({
  searchParams,
}: {
  searchParams?: { campaignId?: string; templateId?: string };
}) {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect(APP_ROUTES.LOGIN);

  if (searchParams?.campaignId) {
    const campaign = queryRow<{ status: string }>(
      'SELECT status FROM "Campaign" WHERE id = ? AND "userId" = ? LIMIT 1',
      [searchParams.campaignId, user.userId],
    );
    if (campaign?.status === 'SENT') {
      redirect(`/dashboard/campaigns/${searchParams.campaignId}`);
    }
  }

  return <CampaignCreateClient campaignId={searchParams?.campaignId} templateIdFromQuery={searchParams?.templateId} />;
}
