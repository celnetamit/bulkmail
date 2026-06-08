import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { hasCapability } from '@/lib/permissions';
import { APP_ROUTES } from '@/lib/routes';
import AdminAgentsClient from './admin-agents-client';

export const dynamic = 'force-dynamic';

export default async function AdminAgentsPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect(APP_ROUTES.LOGIN);
  if (!hasCapability(user.role, 'manage_ai_agents')) redirect(APP_ROUTES.DASHBOARD);

  return <AdminAgentsClient />;
}
