import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { hasCapability } from '@/lib/permissions';
import { APP_ROUTES } from '@/lib/routes';
import ResourceAnalyticsClient from './resource-analytics-client';

export const dynamic = 'force-dynamic';

export default async function ResourceAnalyticsPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect(APP_ROUTES.LOGIN);
  if (!hasCapability(user.role, 'view_resource_analytics')) redirect(APP_ROUTES.DASHBOARD);

  return <ResourceAnalyticsClient role={user.role} />;
}
