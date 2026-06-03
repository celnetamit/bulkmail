import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { DashboardShell } from '@/components/dashboard-shell';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    redirect('/login');
  }

  const role = user.role as 'USER' | 'MANAGER' | 'ADMIN';

  return (
    <DashboardShell email={user.email} role={role}>
      {children}
    </DashboardShell>
  );
}
