import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import AdminAgentsClient from './admin-agents-client';

export const dynamic = 'force-dynamic';

export default async function AdminAgentsPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') redirect('/dashboard');

  return <AdminAgentsClient />;
}
