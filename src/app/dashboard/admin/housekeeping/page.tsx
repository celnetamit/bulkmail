import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { hasCapability } from '@/lib/permissions';
import { APP_ROUTES } from '@/lib/routes';
import HousekeepingClient from './housekeeping-client';

export const dynamic = 'force-dynamic';

export default async function AdminHousekeepingPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect(APP_ROUTES.LOGIN);
  if (!hasCapability(user.role, 'manage_users')) redirect(APP_ROUTES.DASHBOARD);

  return <HousekeepingClient />;
}
