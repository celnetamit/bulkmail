import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { DashboardNav } from '@/components/dashboard-nav';

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
    <div className="dashboard-container">
      <aside className="sidebar">
        <div className="logo">
          <h2>MailFlow</h2>
          <p className="sidebar-subtitle">{role.toLowerCase()} workspace</p>
        </div>
        <DashboardNav role={role} />
      </aside>
      <main className="dashboard-content">
        <header className="dashboard-header">
          <div className="user-profile">
            <div className="user-profile__meta">
              <span className="user-profile__email">{user.email}</span>
              <span className="user-profile__role">{user.role}</span>
            </div>
            <form action="/api/auth/logout?next=/login" method="post">
              <button type="submit" className="logout-btn">Logout</button>
            </form>
          </div>
        </header>
        <div className="content-area">{children}</div>
      </main>
    </div>
  );
}
