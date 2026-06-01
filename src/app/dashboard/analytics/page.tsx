'use client';

import { FormEvent, useEffect, useState } from 'react';

type SummaryResponse = {
  metrics: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
    openRate: number;
    clickRate: number;
    bounceRate: number;
    unsubscribeRate: number;
  };
  campaigns: Array<{ id: string; name: string; listId: string }>;
  lists: Array<{ id: string; name: string }>;
};

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [campaignId, setCampaignId] = useState('');
  const [listId, setListId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  async function load() {
    const params = new URLSearchParams();
    if (campaignId) params.set('campaignId', campaignId);
    if (listId) params.set('listId', listId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const response = await fetch(`/api/analytics/summary?${params.toString()}`, { cache: 'no-store' });
    const data = (await response.json()) as SummaryResponse;
    setSummary(data);
  }

  useEffect(() => {
    load();
  }, []);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    load();
  }

  const metrics = summary?.metrics;

  return (
    <div className="overview">
      <header className="page-header">
        <h1>Analytics</h1>
        <p>Track campaign performance with filterable event metrics.</p>
      </header>

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2>Filters</h2>
        <form className="auth-form" onSubmit={applyFilters}>
          <select className="status-select" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">All Campaigns</option>
            {summary?.campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
          </select>
          <select className="status-select" value={listId} onChange={(e) => setListId(e.target.value)}>
            <option value="">All Lists</option>
            {summary?.lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn-primary" type="submit">Apply Filters</button>
        </form>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><h3>Sent</h3><p className="stat-value">{metrics?.sent ?? 0}</p></div>
        <div className="stat-card"><h3>Delivered</h3><p className="stat-value">{metrics?.delivered ?? 0}</p></div>
        <div className="stat-card"><h3>Opened</h3><p className="stat-value">{metrics?.opened ?? 0}</p></div>
        <div className="stat-card"><h3>Clicked</h3><p className="stat-value">{metrics?.clicked ?? 0}</p></div>
        <div className="stat-card"><h3>Bounced</h3><p className="stat-value text-red">{metrics?.bounced ?? 0}</p></div>
        <div className="stat-card"><h3>Unsubscribed</h3><p className="stat-value text-yellow">{metrics?.unsubscribed ?? 0}</p></div>
      </div>

      <div className="card" style={{ padding: '1rem', marginTop: '1rem' }}>
        <h2>Rates</h2>
        <table className="data-table">
          <thead><tr><th>Metric</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>Open Rate</td><td>{(metrics?.openRate ?? 0).toFixed(2)}%</td></tr>
            <tr><td>Click Rate</td><td>{(metrics?.clickRate ?? 0).toFixed(2)}%</td></tr>
            <tr><td>Bounce Rate</td><td>{(metrics?.bounceRate ?? 0).toFixed(2)}%</td></tr>
            <tr><td>Unsubscribe Rate</td><td>{(metrics?.unsubscribeRate ?? 0).toFixed(2)}%</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
