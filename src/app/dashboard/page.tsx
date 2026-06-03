import { getCurrentUserFromCookies } from '@/lib/auth';
import { getUserAnalyticsSummary } from '@/lib/analytics';
import { getUserQuotaStatus } from '@/lib/quota';
import { recordResourceMetric } from '@/lib/resource-analytics';
import { DashboardOverviewTabs } from '@/components/dashboard-overview-tabs';
import { IconCampaign, IconList, IconPlus, IconTemplate } from '@/components/dashboard-icons';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function DashboardOverview() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');

  recordResourceMetric({
    scopeType: 'GLOBAL',
    eventType: 'PAGE_VIEW',
    userId: user.userId,
    note: 'dashboard_overview',
  });

  const metrics = await getUserAnalyticsSummary(user.userId);
  const quota = await getUserQuotaStatus(user.userId, user.dailyEmailLimit);

  return (
    <div className="overview">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h1>Dashboard Overview</h1>
            <p>Track activity, quotas, and the next best action without digging through every module.</p>
          </div>
          <div className="header-actions">
            <Link href="/dashboard/lists" className="btn-secondary btn-secondary--with-icon">
              <IconList className="btn-icon" aria-hidden="true" />
              Lists
            </Link>
            <Link href="/dashboard/campaigns/create" className="btn-secondary btn-secondary--with-icon">
              <IconPlus className="btn-icon" aria-hidden="true" />
              New Campaign
            </Link>
            <Link href="/dashboard/templates/create" className="btn-secondary btn-secondary--with-icon">
              <IconTemplate className="btn-icon" aria-hidden="true" />
              New Template
            </Link>
          </div>
        </div>
      </header>

      <div className="stats-grid dashboard-stats">
        <div className="stat-card"><h3>Total Sent</h3><p className="stat-value">{metrics.sent}</p></div>
        <div className="stat-card"><h3>Open Rate</h3><p className="stat-value">{metrics.openRate.toFixed(2)}%</p></div>
        <div className="stat-card"><h3>Bounce Rate</h3><p className="stat-value text-red">{metrics.bounceRate.toFixed(2)}%</p></div>
        <div className="stat-card"><h3>Unsubscribe Rate</h3><p className="stat-value text-yellow">{metrics.unsubscribeRate.toFixed(2)}%</p></div>
        <div className="stat-card"><h3>Spam Complaints</h3><p className="stat-value text-red">{metrics.spamComplaints}</p></div>
        <div className="stat-card"><h3>Provider Blocks</h3><p className="stat-value text-red">{metrics.providerBlocks}</p></div>
        <div className="stat-card"><h3>Daily Limit</h3><p className="stat-value">{quota.sentToday}/{quota.dailyLimit}</p></div>
        <div className="stat-card"><h3>Remaining</h3><p className="stat-value">{quota.remainingToday}</p></div>
      </div>

      <DashboardOverviewTabs metrics={metrics} quota={quota} />
    </div>
  );
}
