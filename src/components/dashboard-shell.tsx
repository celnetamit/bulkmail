'use client';

import { type ReactNode, useEffect, useId, useState } from 'react';
import { usePathname } from 'next/navigation';
import { DashboardNav } from '@/components/dashboard-nav';
import { IconClose, IconMenu } from '@/components/dashboard-icons';

type DashboardShellProps = {
  children: ReactNode;
  email: string;
  role: 'USER' | 'MANAGER' | 'ADMIN';
};

export function DashboardShell({ children, email, role }: DashboardShellProps) {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const navId = useId();
  const pathname = usePathname();

  useEffect(() => {
    setIsNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isNavOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsNavOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNavOpen]);

  return (
    <div className={`dashboard-container ${isNavOpen ? 'dashboard-container--nav-open' : ''}`}>
      {isNavOpen ? (
        <button
          type="button"
          className="dashboard-nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setIsNavOpen(false)}
        />
      ) : null}
      <aside className="sidebar" id={navId} aria-label="Dashboard navigation">
        <div className="sidebar__header">
          <div className="logo">
            <h2>MailFlow</h2>
            <p className="sidebar-subtitle">{role.toLowerCase()} workspace</p>
          </div>
          <button type="button" className="sidebar-close" onClick={() => setIsNavOpen(false)}>
            <IconClose aria-hidden="true" />
            <span className="sr-only">Close navigation</span>
          </button>
        </div>
        <DashboardNav role={role} onNavigate={() => setIsNavOpen(false)} />
      </aside>
      <main className="dashboard-content">
        <header className="dashboard-header">
          <div className="dashboard-header__leading">
            <button
              type="button"
              className="dashboard-menu-btn"
              aria-controls={navId}
              aria-expanded={isNavOpen}
              onClick={() => setIsNavOpen(true)}
            >
              <IconMenu aria-hidden="true" />
              <span className="sr-only">Open navigation</span>
            </button>
            <span className="dashboard-header__brand">MailFlow</span>
          </div>
          <div className="user-profile">
            <div className="user-profile__meta">
              <span className="user-profile__email">{email}</span>
              <span className="user-profile__role">{role}</span>
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
