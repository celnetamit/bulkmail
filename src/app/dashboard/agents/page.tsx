import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import AgentsClient from './agents-client';

export const dynamic = 'force-dynamic';

export default async function AgentsPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');

  return <AgentsClient role={user.role} />;
}
