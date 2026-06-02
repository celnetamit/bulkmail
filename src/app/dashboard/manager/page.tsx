import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { hasCapability } from '@/lib/permissions';
import ManagerDashboardClient from './manager-client';

export const dynamic = 'force-dynamic';

export default async function ManagerPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');
  if (!hasCapability(user.role, 'manage_teams')) redirect('/dashboard');

  return <ManagerDashboardClient />;
}
