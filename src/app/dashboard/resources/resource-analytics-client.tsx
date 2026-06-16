'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type ResourceSnapshot = {
  cpuUserMs: number;
  cpuSystemMs: number;
  memoryRssMb: number;
  memoryHeapUsedMb: number;
  memoryHeapTotalMb: number;
  eventLoopUtilization: number;
  activeHandles: number;
  activeRequests: number;
  loadAverage1m: number;
  loadAverage5m: number;
  loadAverage15m: number;
};

type ResourceTrendPoint = {
  day: string;
  samples: number;
  sentCount: number;
  failedCount: number;
  avgRssMb: number;
  peakRssMb: number;
  avgHeapUsedMb: number;
  peakHeapUsedMb: number;
  avgEventLoopUtilization: number;
};

type ResourceUserRow = {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  campaigns: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  avgRssMb: number;
  peakRssMb: number;
  avgHeapUsedMb: number;
  avgDurationMs: number;
  lastSeenAt: string | null;
};

type ResourceTeamRow = {
  teamId: string;
  name: string;
  description: string | null;
  managerEmail: string;
  memberCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  avgRssMb: number;
  peakRssMb: number;
  avgHeapUsedMb: number;
  avgDurationMs: number;
};

type ResourceCampaignRow = {
  campaignId: string;
  name: string;
  subject: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  durationSeconds: number | null;
  peakRssMb: number;
  peakHeapUsedMb: number;
  avgRssMb: number;
  avgHeapUsedMb: number;
  avgEventLoopUtilization: number;
  emailsPerSecond: number;
  sentAt: string | null;
};

type DeliverabilitySummary = {
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  bouncedCount: number;
  unsubscribedCount: number;
  deliveryRate: number;
  openRate: number;
  bounceRate: number;
  unsubscribeRate: number;
};

type DeliverabilityTrendPoint = {
  day: string;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  bouncedCount: number;
  unsubscribedCount: number;
};

type ResourceAnalyticsSummary = {
  scope: 'GLOBAL' | 'TEAM' | 'SELF';
  live: ResourceSnapshot;
  totals: {
    samples: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    campaigns: number;
    users: number;
    teams: number;
    avgRssMb: number;
    peakRssMb: number;
    avgHeapUsedMb: number;
    peakHeapUsedMb: number;
    avgEventLoopUtilization: number;
    peakEventLoopUtilization: number;
    avgDurationMs: number;
    peakDurationMs: number;
    totalRecipients: number;
    throughputPerSecond: number;
    peakDay: string | null;
    peakDaySentCount: number;
  };
  dailyPeaks: ResourceTrendPoint[];
  userBreakdown: ResourceUserRow[];
  teamBreakdown: ResourceTeamRow[];
  campaignCorrelation: ResourceCampaignRow[];
  deliverabilitySummary: DeliverabilitySummary;
  deliverabilityTrend: DeliverabilityTrendPoint[];
};

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
  }).format(date);
}

function formatDurationMs(value: number | null | undefined) {
  if (!value || value <= 0) return '-';
  if (value < 1000) return `${Math.round(value)}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}m ${remaining}s`;
}

function formatRate(value: number) {
  return `${formatNumber(value, 2)}%`;
}

function chartPoints(values: number[], height = 120, padding = 12) {
  const safeValues = values.length ? values : [0];
  const maxValue = Math.max(...safeValues, 1);
  const width = Math.max(1, safeValues.length - 1);
  return safeValues.map((value, index) => {
    const x = width === 0 ? padding : padding + (index / width) * (100 - padding * 2);
    const y = 100 - padding - ((value / maxValue) * (100 - padding * 2));
    return `${x},${y}`;
  }).join(' ');
}

function MultiLineChart({
  title,
  subtitle,
  series,
  height = 180,
}: {
  title: string;
  subtitle?: string;
  series: Array<{ label: string; color: string; values: number[] }>;
  height?: number;
}) {
  const hasData = series.some((entry) => entry.values.some((value) => value > 0));
  return (
    <section className="chart-card card">
      <div className="section-header section-header--compact">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      <div className="chart-legend">
        {series.map((entry) => (
          <span key={entry.label} className="chart-legend__item">
            <span className="chart-legend__swatch" style={{ backgroundColor: entry.color }} />
            {entry.label}
          </span>
        ))}
      </div>
      <div className="chart-surface" style={{ height }}>
        {hasData ? (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="chart-svg">
            {series.map((entry) => {
              const points = chartPoints(entry.values);
              return (
                <polyline
                  key={entry.label}
                  fill="none"
                  stroke={entry.color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={points}
                />
              );
            })}
          </svg>
        ) : (
          <div className="chart-empty">No data in this range yet.</div>
        )}
      </div>
    </section>
  );
}

function BarChart({
  title,
  subtitle,
  labels,
  values,
  color,
  height = 180,
}: {
  title: string;
  subtitle?: string;
  labels: string[];
  values: number[];
  color: string;
  height?: number;
}) {
  const maxValue = Math.max(...values, 1);
  return (
    <section className="chart-card card">
      <div className="section-header section-header--compact">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      <div className="chart-surface" style={{ height }}>
        {values.length ? (
          <div className="bar-chart">
            {values.map((value, index) => (
              <div key={`${labels[index]}-${index}`} className="bar-chart__item">
                <div className="bar-chart__track">
                  <div
                    className="bar-chart__fill"
                    style={{ height: `${Math.max(4, (value / maxValue) * 100)}%`, backgroundColor: color }}
                    title={`${labels[index]}: ${value}`}
                  />
                </div>
                <span className="bar-chart__label">{labels[index]}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="chart-empty">No data in this range yet.</div>
        )}
      </div>
    </section>
  );
}

function ScatterChart({
  title,
  subtitle,
  points,
}: {
  title: string;
  subtitle?: string;
  points: Array<{ x: number; y: number; radius: number; label: string; color: string }>;
}) {
  const maxX = Math.max(...points.map((point) => point.x), 1);
  const maxY = Math.max(...points.map((point) => point.y), 1);
  const maxRadius = Math.max(...points.map((point) => point.radius), 1);

  return (
    <section className="chart-card card">
      <div className="section-header section-header--compact">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      <div className="chart-surface chart-surface--scatter">
        {points.length ? (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="chart-svg">
            {points.map((point) => {
              const x = 10 + (point.x / maxX) * 80;
              const y = 90 - (point.y / maxY) * 80;
              const r = 3 + (point.radius / maxRadius) * 4;
              return (
                <circle key={point.label} cx={x} cy={y} r={r} fill={point.color} opacity="0.8">
                  <title>{point.label}</title>
                </circle>
              );
            })}
          </svg>
        ) : (
          <div className="chart-empty">No campaign correlation data yet.</div>
        )}
      </div>
    </section>
  );
}

export default function ResourceAnalyticsClient({ role }: { role: string }) {
  const [summary, setSummary] = useState<ResourceAnalyticsSummary | null>(null);
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - 13);
    return date.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    setMessage('');
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const response = await fetch(`/api/resource-analytics/summary?${params.toString()}`, { cache: 'no-store' });
    const text = await response.text();
    let data: (ResourceAnalyticsSummary & { error?: string }) | null = null;
    try {
      data = text ? (JSON.parse(text) as ResourceAnalyticsSummary & { error?: string }) : null;
    } catch {
      data = null;
    }
    setLoading(false);
    if (!response.ok) {
      setMessage(data?.error || text || 'Failed to load resource analytics.');
      return;
    }

    if (!data) {
      setMessage('Failed to load resource analytics.');
      return;
    }

    setSummary(data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    load();
  }

  const metrics = summary?.totals;
  const daily = summary?.dailyPeaks || [];
  const users = summary?.userBreakdown || [];
  const teams = summary?.teamBreakdown || [];
  const campaigns = summary?.campaignCorrelation || [];
  const deliverability = summary?.deliverabilitySummary;
  const deliverabilityTrend = summary?.deliverabilityTrend || [];

  const memorySeries = useMemo(() => [
    { label: 'Avg RSS', color: '#60a5fa', values: daily.map((point) => point.avgRssMb) },
    { label: 'Peak RSS', color: '#c084fc', values: daily.map((point) => point.peakRssMb) },
    { label: 'Avg Heap', color: '#34d399', values: daily.map((point) => point.avgHeapUsedMb) },
  ], [daily]);

  const throughputSeries = useMemo(() => [
    { label: 'Sent', color: '#3b82f6', values: daily.map((point) => point.sentCount) },
    { label: 'Failed', color: '#ef4444', values: daily.map((point) => point.failedCount) },
  ], [daily]);

  const loopSeries = useMemo(() => [
    { label: 'Event loop', color: '#f59e0b', values: daily.map((point) => point.avgEventLoopUtilization * 100) },
  ], [daily]);

  const deliverabilitySeries = useMemo(() => [
    { label: 'Sent', color: '#3b82f6', values: deliverabilityTrend.map((point) => point.sentCount) },
    { label: 'Delivered', color: '#22c55e', values: deliverabilityTrend.map((point) => point.deliveredCount) },
    { label: 'Opened', color: '#f59e0b', values: deliverabilityTrend.map((point) => point.openedCount) },
    { label: 'Bounced', color: '#ef4444', values: deliverabilityTrend.map((point) => point.bouncedCount) },
    { label: 'Unsubscribed', color: '#a855f7', values: deliverabilityTrend.map((point) => point.unsubscribedCount) },
  ], [deliverabilityTrend]);

  const scatterPoints = useMemo(() => campaigns.map((campaign) => ({
    x: Math.max(campaign.durationSeconds ?? 0, 1),
    y: Math.max(campaign.sentCount, 1),
    radius: Math.max(campaign.peakRssMb, 1),
    label: campaign.name,
    color: '#60a5fa',
  })), [campaigns]);

  const dailyLabels = daily.map((point) => formatDate(point.day));

  return (
    <div className="overview resource-dashboard">
      <header className="page-header page-header__row">
        <div>
          <h1>Resource Analytics</h1>
          <p>Trace global load, team usage, and send spikes so you can see where the platform is working hardest.</p>
        </div>
        <div className="header-actions">
          <form className="resource-filter" onSubmit={applyFilters}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Loading' : 'Refresh'}
            </button>
          </form>
        </div>
      </header>

      {message ? <div className="form-message">{message}</div> : null}

      <div className="stats-grid resource-stats-grid">
        <div className="stat-card"><h3>Samples</h3><p className="stat-value">{metrics?.samples ?? 0}</p></div>
        <div className="stat-card"><h3>Sent</h3><p className="stat-value">{metrics?.sentCount ?? 0}</p></div>
        <div className="stat-card"><h3>Failed</h3><p className="stat-value text-red">{metrics?.failedCount ?? 0}</p></div>
        <div className="stat-card"><h3>Skipped</h3><p className="stat-value text-yellow">{metrics?.skippedCount ?? 0}</p></div>
        <div className="stat-card"><h3>Campaigns</h3><p className="stat-value">{metrics?.campaigns ?? 0}</p></div>
        <div className="stat-card"><h3>Teams</h3><p className="stat-value">{metrics?.teams ?? 0}</p></div>
        <div className="stat-card"><h3>Peak RSS</h3><p className="stat-value">{formatNumber(metrics?.peakRssMb ?? 0, 1)} MB</p></div>
        <div className="stat-card"><h3>Peak Heap</h3><p className="stat-value">{formatNumber(metrics?.peakHeapUsedMb ?? 0, 1)} MB</p></div>
        <div className="stat-card"><h3>Throughput</h3><p className="stat-value">{formatNumber(metrics?.throughputPerSecond ?? 0, 1)}/s</p></div>
        <div className="stat-card"><h3>Peak Day</h3><p className="stat-value">{metrics?.peakDay ? formatDate(metrics.peakDay) : '-'}</p></div>
        <div className="stat-card"><h3>Live RSS</h3><p className="stat-value">{formatNumber(summary?.live.memoryRssMb ?? 0, 1)} MB</p></div>
        <div className="stat-card"><h3>Live Event Loop</h3><p className="stat-value">{formatRate((summary?.live.eventLoopUtilization ?? 0) * 100)}</p></div>
      </div>

      <div className="stats-grid resource-stats-grid" style={{ marginTop: '1rem' }}>
        <div className="stat-card"><h3>Delivery rate</h3><p className="stat-value">{formatRate(deliverability?.deliveryRate ?? 0)}</p></div>
        <div className="stat-card"><h3>Open rate</h3><p className="stat-value">{formatRate(deliverability?.openRate ?? 0)}</p></div>
        <div className="stat-card"><h3>Bounce rate</h3><p className="stat-value text-red">{formatRate(deliverability?.bounceRate ?? 0)}</p></div>
        <div className="stat-card"><h3>Unsubscribe rate</h3><p className="stat-value text-yellow">{formatRate(deliverability?.unsubscribeRate ?? 0)}</p></div>
        <div className="stat-card"><h3>Delivered</h3><p className="stat-value">{deliverability?.deliveredCount ?? 0}</p></div>
        <div className="stat-card"><h3>Opened</h3><p className="stat-value">{deliverability?.openedCount ?? 0}</p></div>
      </div>

      <div className="resource-charts">
        <MultiLineChart
          title="Memory pressure"
          subtitle="Average and peak RSS/heap samples across the selected window."
          series={memorySeries}
        />
        <MultiLineChart
          title="Event loop"
          subtitle="A coarse look at the runtime’s busy time while the platform is under load."
          series={loopSeries}
        />
        <MultiLineChart
          title="Deliverability trend"
          subtitle="Daily sent, delivered, opened, bounced, and unsubscribed volume."
          series={deliverabilitySeries}
        />
        <BarChart
          title="Daily throughput"
          subtitle="Sent and failed events by day."
          labels={dailyLabels}
          values={daily.map((point) => point.sentCount)}
          color="#3b82f6"
        />
        <BarChart
          title="Daily failures"
          subtitle="Failure volume by day for the same window."
          labels={dailyLabels}
          values={daily.map((point) => point.failedCount)}
          color="#ef4444"
        />
      </div>

      <div className="resource-section">
        <div className="card resource-table-card">
          <div className="section-header section-header--compact">
            <div>
              <h2>Daily peaks</h2>
              <p>Where the platform was hottest each day.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table resource-daily-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Samples</th>
                  <th>Sent</th>
                  <th>Failed</th>
                  <th>Avg RSS</th>
                  <th>Peak RSS</th>
                  <th>Avg Heap</th>
                  <th>Event Loop</th>
                </tr>
              </thead>
              <tbody>
                {daily.length ? daily.map((row) => (
                  <tr key={row.day}>
                    <td>{formatDate(row.day)}</td>
                    <td>{row.samples}</td>
                    <td>{row.sentCount}</td>
                    <td className="text-red">{row.failedCount}</td>
                    <td>{formatNumber(row.avgRssMb, 1)} MB</td>
                    <td>{formatNumber(row.peakRssMb, 1)} MB</td>
                    <td>{formatNumber(row.avgHeapUsedMb, 1)} MB</td>
                    <td>{formatRate(row.avgEventLoopUtilization * 100)}</td>
                  </tr>
                )) : <tr><td colSpan={8}>No snapshots collected yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card resource-table-card">
          <div className="section-header section-header--compact">
            <div>
              <h2>Per-user breakdown</h2>
              <p>Send activity and runtime pressure by user.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table resource-user-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Campaigns</th>
                  <th>Sent</th>
                  <th>Failed</th>
                  <th>Skipped</th>
                  <th>Avg RSS</th>
                  <th>Peak RSS</th>
                  <th>Avg Send</th>
                </tr>
              </thead>
              <tbody>
                {users.length ? users.map((row) => (
                  <tr key={row.userId}>
                    <td>
                      <strong>{row.email}</strong>
                      <div className="cell-subtitle">{row.name || row.role}</div>
                    </td>
                    <td>{row.campaigns}</td>
                    <td>{row.sentCount}</td>
                    <td className="text-red">{row.failedCount}</td>
                    <td>{row.skippedCount}</td>
                    <td>{formatNumber(row.avgRssMb, 1)} MB</td>
                    <td>{formatNumber(row.peakRssMb, 1)} MB</td>
                    <td>{formatDurationMs(row.avgDurationMs)}</td>
                  </tr>
                )) : <tr><td colSpan={8}>No user resource data yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card resource-table-card">
          <div className="section-header section-header--compact">
            <div>
              <h2>Per-team breakdown</h2>
              <p>Team-level allocation and send pressure.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table resource-team-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Members</th>
                  <th>Sent</th>
                  <th>Failed</th>
                  <th>Skipped</th>
                  <th>Avg RSS</th>
                  <th>Peak RSS</th>
                  <th>Avg Send</th>
                </tr>
              </thead>
              <tbody>
                {teams.length ? teams.map((row) => (
                  <tr key={row.teamId}>
                    <td>
                      <strong>{row.name}</strong>
                      <div className="cell-subtitle">{row.managerEmail}</div>
                    </td>
                    <td>{row.memberCount}</td>
                    <td>{row.sentCount}</td>
                    <td className="text-red">{row.failedCount}</td>
                    <td>{row.skippedCount}</td>
                    <td>{formatNumber(row.avgRssMb, 1)} MB</td>
                    <td>{formatNumber(row.peakRssMb, 1)} MB</td>
                    <td>{formatDurationMs(row.avgDurationMs)}</td>
                  </tr>
                )) : <tr><td colSpan={8}>No team resource data yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <ScatterChart
          title="Send-to-resource correlation"
          subtitle="Each dot is a campaign completion sample. Larger dots mean more memory pressure."
          points={scatterPoints}
        />

        <div className="card resource-table-card">
          <div className="section-header section-header--compact">
            <div>
              <h2>Campaign correlation</h2>
              <p>How send volume, duration, and runtime pressure line up per campaign.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table resource-campaign-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Duration</th>
                  <th>Throughput</th>
                  <th>Peak RSS</th>
                  <th>Peak Heap</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.length ? campaigns.map((row) => (
                  <tr key={row.campaignId}>
                    <td>
                      <strong>{row.name}</strong>
                      <div className="cell-subtitle">{row.subject}</div>
                    </td>
                    <td>{row.status}</td>
                    <td>{row.sentCount}</td>
                    <td>{formatDurationMs((row.durationSeconds || 0) * 1000)}</td>
                    <td>{formatNumber(row.emailsPerSecond, 1)}/s</td>
                    <td>{formatNumber(row.peakRssMb, 1)} MB</td>
                    <td>{formatNumber(row.peakHeapUsedMb, 1)} MB</td>
                  </tr>
                )) : <tr><td colSpan={7}>No campaign correlation data yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {role === 'ADMIN' ? (
        <div className="card" style={{ padding: '1rem', marginTop: '1rem' }}>
          <h2>Admin note</h2>
          <p>Global sampling is recorded whenever resource analytics is opened and during large sends, so you can review spikes after the fact.</p>
        </div>
      ) : null}
    </div>
  );
}
