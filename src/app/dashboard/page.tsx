import { getCurrentUserFromCookies } from '@/lib/auth';
import { getUserAnalyticsSummary } from '@/lib/analytics';
import { getUserQuotaStatus } from '@/lib/quota';
import { redirect } from 'next/navigation';

export default async function DashboardOverview() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');

  const metrics = await getUserAnalyticsSummary(user.userId);
  const quota = await getUserQuotaStatus(user.userId, user.dailyEmailLimit);

  return (
    <div className="overview">
      <header className="page-header">
        <h1>Dashboard Overview</h1>
        <p>Welcome back! Here is a live snapshot from your event pipeline.</p>
      </header>

      <div className="stats-grid">
        <div className="stat-card"><h3>Total Sent</h3><p className="stat-value">{metrics.sent}</p></div>
        <div className="stat-card"><h3>Open Rate</h3><p className="stat-value">{metrics.openRate.toFixed(2)}%</p></div>
        <div className="stat-card"><h3>Bounce Rate</h3><p className="stat-value text-red">{metrics.bounceRate.toFixed(2)}%</p></div>
        <div className="stat-card"><h3>Unsubscribe Rate</h3><p className="stat-value text-yellow">{metrics.unsubscribeRate.toFixed(2)}%</p></div>
        <div className="stat-card"><h3>Daily Limit</h3><p className="stat-value">{quota.sentToday}/{quota.dailyLimit}</p></div>
        <div className="stat-card"><h3>Remaining</h3><p className="stat-value">{quota.remainingToday}</p></div>
      </div>

      <div className="card" style={{ padding: '1rem' }}>
        <h2>Next Step</h2>
        <p>Visit Analytics for campaign, list, and date-filtered performance breakdown.</p>
      </div>
    </div>
  );
}
