import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import ResourceAnalyticsClient from './resource-analytics-client';

export const dynamic = 'force-dynamic';

export default async function ResourceAnalyticsPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');
  if (!['MANAGER', 'ADMIN'].includes(user.role)) redirect('/dashboard');

  return <ResourceAnalyticsClient role={user.role} />;
}
