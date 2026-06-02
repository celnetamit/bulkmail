import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { hasCapability } from '@/lib/permissions';
import AdminAgentsClient from './admin-agents-client';

export const dynamic = 'force-dynamic';

export default async function AdminAgentsPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');
  if (!hasCapability(user.role, 'manage_ai_agents')) redirect('/dashboard');

  return <AdminAgentsClient />;
}
