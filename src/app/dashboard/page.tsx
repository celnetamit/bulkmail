import { getCurrentUserFromCookies } from '@/lib/auth';
import { getUserAnalyticsSummary } from '@/lib/analytics';
import { getUserQuotaStatus } from '@/lib/quota';
import { recordResourceMetric } from '@/lib/resource-analytics';
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
            <Link href="/dashboard/lists" className="btn-secondary">Lists</Link>
            <Link href="/dashboard/campaigns/create" className="btn-secondary">New Campaign</Link>
            <Link href="/dashboard/templates/create" className="btn-secondary">New Template</Link>
          </div>
        </div>
      </header>

      <div className="stats-grid dashboard-stats">
        <div className="stat-card"><h3>Total Sent</h3><p className="stat-value">{metrics.sent}</p></div>
        <div className="stat-card"><h3>Open Rate</h3><p className="stat-value">{metrics.openRate.toFixed(2)}%</p></div>
        <div className="stat-card"><h3>Bounce Rate</h3><p className="stat-value text-red">{metrics.bounceRate.toFixed(2)}%</p></div>
        <div className="stat-card"><h3>Unsubscribe Rate</h3><p className="stat-value text-yellow">{metrics.unsubscribeRate.toFixed(2)}%</p></div>
        <div className="stat-card"><h3>Daily Limit</h3><p className="stat-value">{quota.sentToday}/{quota.dailyLimit}</p></div>
        <div className="stat-card"><h3>Remaining</h3><p className="stat-value">{quota.remainingToday}</p></div>
      </div>

      <div className="dashboard-panels">
        <section className="card dashboard-panel">
          <h2>Next step</h2>
          <p>Start with a list, then build the campaign, send a test, and watch delivery metrics land in Analytics.</p>
        </section>
        <section className="card dashboard-panel">
          <h2>Today</h2>
          <p>{quota.remainingToday} messages remain in your daily allowance.</p>
        </section>
        <section className="card dashboard-panel">
          <h2>Quick actions</h2>
          <div className="quick-actions">
            <Link href="/dashboard/lists" className="mini-btn">Manage lists</Link>
            <Link href="/dashboard/media-library" className="mini-btn">Open media</Link>
            <Link href="/dashboard/help" className="mini-btn">Read guide</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
