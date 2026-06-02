import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { hasCapability } from '@/lib/permissions';
import ResourceAnalyticsClient from './resource-analytics-client';

export const dynamic = 'force-dynamic';

export default async function ResourceAnalyticsPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');
  if (!hasCapability(user.role, 'view_resource_analytics')) redirect('/dashboard');

  return <ResourceAnalyticsClient role={user.role} />;
}
