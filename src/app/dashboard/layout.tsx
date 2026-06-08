import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies, getImpersonationContextFromCookies } from '@/lib/auth';
import { DashboardShell } from '@/components/dashboard-shell';

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
    redirect('/login');
  }

  const role = user.role as 'USER' | 'MANAGER' | 'ADMIN';

  return (
    <DashboardShell email={user.email} role={role} impersonation={impersonation}>
      {children}
    </DashboardShell>
  );
}
