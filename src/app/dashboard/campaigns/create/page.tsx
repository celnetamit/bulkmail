import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { CampaignCreateClient } from './campaign-create-client';

export default async function CampaignCreatePage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');

  return <CampaignCreateClient />;
}
