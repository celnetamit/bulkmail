'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { SVGProps } from 'react';
import {
  IconAdmin,
  IconAgents,
  IconAnalytics,
  IconCampaign,
  IconHelp,
  IconHome,
  IconImport,
  IconList,
  IconMail,
  IconManager,
  IconMedia,
  IconResources,
  IconSettings,
  IconTemplate,
} from '@/components/dashboard-icons';
import { APP_ROUTES } from '@/lib/routes';

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  role?: Array<'MANAGER' | 'ADMIN'>;
  adminOnly?: boolean;
  icon?: (props: SVGProps<SVGSVGElement>) => JSX.Element;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const GROUPS: NavGroup[] = [
  {
    label: 'Work',
    items: [
      { href: APP_ROUTES.DASHBOARD, label: 'Overview', exact: true, icon: IconHome },
      { href: `${APP_ROUTES.DASHBOARD}/lists`, label: 'Lists', icon: IconList },
      { href: `${APP_ROUTES.DASHBOARD}/contacts`, label: 'Emails', icon: IconMail },
      { href: `${APP_ROUTES.DASHBOARD}/templates`, label: 'Templates', icon: IconTemplate },
      { href: `${APP_ROUTES.DASHBOARD}/campaigns`, label: 'Campaigns', icon: IconCampaign },
      { href: `${APP_ROUTES.DASHBOARD}/media-library`, label: 'Media Library', icon: IconMedia },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: `${APP_ROUTES.DASHBOARD}/analytics`, label: 'Analytics', icon: IconAnalytics },
      { href: `${APP_ROUTES.DASHBOARD}/resources`, label: 'Resources', role: ['MANAGER', 'ADMIN'], icon: IconResources },
    ],
  },
  {
    label: 'Assistants',
    items: [
      { href: `${APP_ROUTES.DASHBOARD}/agents`, label: 'Agents', icon: IconAgents },
      { href: `${APP_ROUTES.DASHBOARD}/help`, label: 'Help', icon: IconHelp },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: `${APP_ROUTES.DASHBOARD}/settings`, label: 'Settings', icon: IconSettings },
      { href: `${APP_ROUTES.DASHBOARD}/manager`, label: 'Manager', role: ['MANAGER', 'ADMIN'], icon: IconManager },
      { href: APP_ROUTES.ADMIN_DASHBOARD, label: 'Admin', adminOnly: true, icon: IconAdmin },
      { href: `${APP_ROUTES.ADMIN_DASHBOARD}/housekeeping`, label: 'Housekeeping', adminOnly: true, icon: IconSettings },
      { href: `${APP_ROUTES.ADMIN_DASHBOARD}/agents`, label: 'AI Settings', adminOnly: true, icon: IconImport },
    ],
  },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function DashboardNav({
  role,
  onNavigate,
}: {
  role: 'USER' | 'MANAGER' | 'ADMIN';
  onNavigate?: () => void;
}) {
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
                  onClick={onNavigate}
                >
                  {item.icon ? <item.icon className="nav-link__icon" aria-hidden="true" /> : null}
                  {item.label}
                </Link>
              ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
