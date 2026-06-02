import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { hasCapability } from '@/lib/permissions';
import AdminDashboardClient from './admin-client';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');
  if (!hasCapability(user.role, 'manage_users')) redirect('/dashboard');

  return <AdminDashboardClient />;
}
