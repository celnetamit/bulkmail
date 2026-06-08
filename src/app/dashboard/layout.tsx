import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies, getImpersonationContextFromCookies } from '@/lib/auth';
import { DashboardShell } from '@/components/dashboard-shell';
import { APP_ROUTES } from '@/lib/routes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserFromCookies();
  const impersonation = await getImpersonationContextFromCookies();

  if (!user) {
    redirect(APP_ROUTES.LOGIN);
  }

  const role = user.role as 'USER' | 'MANAGER' | 'ADMIN';

  return (
    <DashboardShell email={user.email} role={role} impersonation={impersonation}>
      {children}
    </DashboardShell>
  );
}
