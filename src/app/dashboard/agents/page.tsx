import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { hasCapability } from '@/lib/permissions';
import AgentsClient from './agents-client';

export const dynamic = 'force-dynamic';

export default async function AgentsPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');
  if (!hasCapability(user.role, 'use_agents')) redirect('/dashboard');

  return <AgentsClient role={user.role} />;
}
