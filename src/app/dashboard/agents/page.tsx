import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { hasCapability } from '@/lib/permissions';
import { APP_ROUTES } from '@/lib/routes';
import AgentsClient from './agents-client';

export const dynamic = 'force-dynamic';

export default async function AgentsPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect(APP_ROUTES.LOGIN);
  if (!hasCapability(user.role, 'use_agents')) redirect(APP_ROUTES.DASHBOARD);

  return <AgentsClient role={user.role} />;
}
