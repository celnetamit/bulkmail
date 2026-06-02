'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  role?: Array<'MANAGER' | 'ADMIN'>;
  adminOnly?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const GROUPS: NavGroup[] = [
  {
    label: 'Work',
    items: [
      { href: '/dashboard', label: 'Overview', exact: true },
      { href: '/dashboard/lists', label: 'Lists' },
      { href: '/dashboard/templates', label: 'Templates' },
      { href: '/dashboard/campaigns', label: 'Campaigns' },
      { href: '/dashboard/media-library', label: 'Media Library' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/dashboard/analytics', label: 'Analytics' },
      { href: '/dashboard/resources', label: 'Resources', role: ['MANAGER', 'ADMIN'] },
    ],
  },
  {
    label: 'Assistants',
    items: [
      { href: '/dashboard/agents', label: 'Agents' },
      { href: '/dashboard/help', label: 'Help' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/dashboard/settings', label: 'Settings' },
      { href: '/dashboard/manager', label: 'Manager', role: ['MANAGER', 'ADMIN'] },
      { href: '/dashboard/admin', label: 'Admin', adminOnly: true },
      { href: '/dashboard/admin/agents', label: 'AI Settings', adminOnly: true },
    ],
  },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function DashboardNav({ role }: { role: 'USER' | 'MANAGER' | 'ADMIN' }) {
  const pathname = usePathname() || '';

  return (
    <nav className="nav-menu" aria-label="Dashboard">
      {GROUPS.map((group) => (
        <div key={group.label} className="nav-group">
          <div className="nav-group__label">{group.label}</div>
          <div className="nav-group__items">
            {group.items
              .filter((item) => {
                if (item.adminOnly) return role === 'ADMIN';
                if (item.role) return item.role.includes(role as 'MANAGER' | 'ADMIN');
                return true;
              })
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${isActive(pathname, item) ? 'nav-link--active' : ''}`}
                  aria-current={isActive(pathname, item) ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
