import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { hasCapability } from '@/lib/permissions';
import { APP_ROUTES } from '@/lib/routes';
import ManagerDashboardClient from './manager-client';

export const dynamic = 'force-dynamic';

export default async function ManagerPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect(APP_ROUTES.LOGIN);
  if (!hasCapability(user.role, 'manage_teams')) redirect(APP_ROUTES.DASHBOARD);

  return <ManagerDashboardClient />;
}
