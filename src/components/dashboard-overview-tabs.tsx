'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type OverviewMetrics = {
  sent: number;
  delivered: number;
  opened: number;
  openRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  spamComplaints: number;
  providerBlocks: number;
  suppressedContacts: number;
};

type Quota = {
  sentToday: number;
  dailyLimit: number;
  remainingToday: number;
};

type OverviewTab = 'latest' | 'audience' | 'campaigns' | 'analytics';

type OverviewTabConfig = {
  key: OverviewTab;
  label: string;
  title: string;
  summary: string;
  chips: Array<{ label: string; value: string }>;
  action: { label: string; href: string };
  footnote: string;
};

export function DashboardOverviewTabs({
  metrics,
  quota,
}: {
  metrics: OverviewMetrics;
  quota: Quota;
}) {
  const [activeTab, setActiveTab] = useState<OverviewTab>('latest');

  const tabs = useMemo<OverviewTabConfig[]>(
    () => [
      {
        key: 'latest',
        label: 'Latest Activity',
        title: 'Explore activity',
        summary:
          'Your latest sends, delivery signals, and queue movement all stay visible in one place so you can keep an eye on the day as it unfolds.',
        chips: [
          { label: 'Sent', value: metrics.sent.toLocaleString() },
          { label: 'Open Rate', value: `${metrics.openRate.toFixed(2)}%` },
          { label: 'Remaining', value: quota.remainingToday.toLocaleString() },
          { label: 'Daily Limit', value: quota.dailyLimit.toLocaleString() },
        ],
        action: { label: 'View Analytics', href: '/dashboard/analytics' },
        footnote: `You have ${quota.sentToday.toLocaleString()} messages sent today and ${quota.remainingToday.toLocaleString()} left in the allowance.`,
      },
      {
        key: 'audience',
        label: 'Audience Health',
        title: 'Review audience health',
        summary:
          'List growth, suppression, and subscriber quality all feed into whether the next campaign should move forward or wait for cleanup.',
        chips: [
          { label: 'Bounce Rate', value: `${metrics.bounceRate.toFixed(2)}%` },
          { label: 'Unsubscribe', value: `${metrics.unsubscribeRate.toFixed(2)}%` },
          { label: 'Suppressed', value: metrics.suppressedContacts.toLocaleString() },
          { label: 'Lists', value: 'Managed' },
        ],
        action: { label: 'Open Lists', href: '/dashboard/lists' },
        footnote: 'Check list quality before scaling up another send.',
      },
      {
        key: 'campaigns',
        label: 'Campaign Queue',
        title: 'Keep campaigns moving',
        summary:
          'Track what is queued, retrying, or already sent so operators can move quickly without digging through multiple pages.',
        chips: [
          { label: 'Queue', value: 'Live' },
          { label: 'Retries', value: 'Monitored' },
          { label: 'Tests', value: 'Ready' },
          { label: 'Copy', value: 'Available' },
        ],
        action: { label: 'Open Campaigns', href: '/dashboard/campaigns' },
        footnote: 'Use a test list first, then send across the selected audience lists.',
      },
      {
        key: 'analytics',
        label: 'Analytics',
        title: 'Measure what landed',
        summary:
          'Open rates, bounce trends, and unsubscribes are all easiest to interpret when they sit in the same weekly view.',
        chips: [
          { label: 'Delivered', value: metrics.delivered.toLocaleString() },
          { label: 'Opened', value: metrics.opened.toLocaleString() },
          { label: 'Bounced', value: `${metrics.bounceRate.toFixed(2)}%` },
          { label: 'Blocks', value: metrics.providerBlocks.toLocaleString() },
          { label: 'Spam', value: metrics.spamComplaints.toLocaleString() },
        ],
        action: { label: 'Open Analytics', href: '/dashboard/analytics' },
        footnote: 'The performance curve is easiest to read after a few sends have completed.',
      },
    ],
    [metrics.bounceRate, metrics.delivered, metrics.openRate, metrics.opened, metrics.providerBlocks, metrics.sent, metrics.spamComplaints, metrics.suppressedContacts, metrics.unsubscribeRate, quota.dailyLimit, quota.remainingToday, quota.sentToday],
  );

  const current = tabs.find((tab) => tab.key === activeTab) || tabs[0];

  return (
    <section className="overview-rail">
      <div className="overview-tabs" role="tablist" aria-label="Dashboard focus tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`overview-tab ${activeTab === tab.key ? 'overview-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
            role="tab"
            aria-selected={activeTab === tab.key}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="overview-section-head">
        <h2>{current.title}</h2>
        <span className="overview-section-head__count">Focused items: {tabs.length}</span>
      </div>

      <article className="overview-story-card">
        <div className="overview-story-card__chips">
          {current.chips.map((chip) => (
            <span key={`${current.key}-${chip.label}`} className="overview-chip">
              <strong>{chip.value}</strong>
              <span>{chip.label}</span>
            </span>
          ))}
        </div>

        <div className="overview-story-card__body">
          <p className="overview-story-card__meta">By MailFlow overview</p>
          <p className="overview-story-card__summary">{current.summary}</p>
          <p className="overview-story-card__footnote">{current.footnote}</p>
        </div>

        <div className="overview-story-card__footer">
          <Link className="btn-secondary overview-story-card__action" href={current.action.href}>
            {current.action.label}
          </Link>
        </div>
      </article>
    </section>
  );
}
