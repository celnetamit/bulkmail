import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div className="logo">
          <h2>MailFlow</h2>
        </div>
        <nav className="nav-menu">
          <Link href="/dashboard" className="nav-link">Overview</Link>
          <Link href="/dashboard/lists" className="nav-link">Lists</Link>
          <Link href="/dashboard/templates" className="nav-link">Templates</Link>
          <Link href="/dashboard/campaigns" className="nav-link">Campaigns</Link>
          <Link href="/dashboard/analytics" className="nav-link">Analytics</Link>
          <Link href="/dashboard/help" className="nav-link">Help</Link>
          <Link href="/dashboard/settings" className="nav-link">Settings</Link>
          {user.role === 'ADMIN' ? <Link href="/dashboard/admin" className="nav-link">Admin</Link> : null}
        </nav>
      </aside>
      <main className="dashboard-content">
        <header className="dashboard-header">
          <div className="user-profile">
            <span>{user.email}</span>
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
