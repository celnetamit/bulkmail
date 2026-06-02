import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import AdminDashboardClient from './admin-client';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') redirect('/dashboard');

  return <AdminDashboardClient />;
}
