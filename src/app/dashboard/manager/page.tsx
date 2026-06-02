import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import ManagerDashboardClient from './manager-client';

export default async function ManagerPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');
  if (!['MANAGER', 'ADMIN'].includes(user.role)) redirect('/dashboard');

  return <ManagerDashboardClient />;
}
