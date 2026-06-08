import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { APP_ROUTES } from '@/lib/routes';
import { CampaignCreateClient } from './campaign-create-client';

export const dynamic = 'force-dynamic';

export default async function CampaignCreatePage({
  searchParams,
}: {
  searchParams?: { campaignId?: string; templateId?: string };
}) {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect(APP_ROUTES.LOGIN);

  return <CampaignCreateClient campaignId={searchParams?.campaignId} templateIdFromQuery={searchParams?.templateId} />;
}
