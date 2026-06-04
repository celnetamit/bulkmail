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
    spamComplaints: number;
    providerBlocks: number;
    spamComplaintRate: number;
    providerBlockRate: number;
    suppressedContacts: number;
    contactStats: {
      total: number;
      subscribed: number;
      bounced: number;
      unsubscribed: number;
    };
    detections: Array<{
      key: string;
      title: string;
      status: 'healthy' | 'watch' | 'critical' | 'idle';
      value: number;
      count: number;
      unit: 'percent' | 'count';
      detail: string;
    }>;
    eventDetails: Array<{
      id: string;
      type: string;
      provider: string | null;
      email: string | null;
      contactStatus: string | null;
      campaignId: string | null;
      campaignName: string | null;
      listId: string | null;
      listName: string | null;
      providerEventId: string | null;
      providerMessageId: string | null;
      createdAt: string;
    }>;
  };
  campaigns: Array<{ id: string; name: string; listId: string; ownerEmail?: string; ownerName?: string | null; ownerRole?: string }>;
  lists: Array<{ id: string; name: string; ownerEmail?: string; ownerName?: string | null; ownerRole?: string }>;
};

function detectionBadgeClass(status: SummaryResponse['metrics']['detections'][number]['status']) {
  if (status === 'healthy') return 'badge-success';
  if (status === 'critical') return 'badge-danger';
  if (status === 'watch') return 'badge-warning';
  return 'badge-info';
}

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
  const eventDetails = metrics?.eventDetails || [];
  const openedEvents = eventDetails.filter((event) => event.type === 'OPENED');
  const bouncedEvents = eventDetails.filter((event) => event.type === 'BOUNCED');
  const unsubscribedEvents = eventDetails.filter((event) => event.type === 'UNSUBSCRIBED');
  const deliveredEvents = eventDetails.filter((event) => event.type === 'DELIVERED');

  function formatEventTime(value: string) {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return value;
    return new Date(parsed).toLocaleString();
  }

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
            {summary?.campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}{campaign.ownerEmail ? ` - ${campaign.ownerName || campaign.ownerEmail}` : ''}
              </option>
            ))}
          </select>
          <select className="status-select" value={listId} onChange={(e) => setListId(e.target.value)}>
            <option value="">All Lists</option>
            {summary?.lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}{list.ownerEmail ? ` - ${list.ownerName || list.ownerEmail}` : ''}
              </option>
            ))}
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
        <div className="stat-card"><h3>Spam Complaints</h3><p className="stat-value text-red">{metrics?.spamComplaints ?? 0}</p></div>
        <div className="stat-card"><h3>Provider Blocks</h3><p className="stat-value text-red">{metrics?.providerBlocks ?? 0}</p></div>
        <div className="stat-card"><h3>Suppressed Contacts</h3><p className="stat-value text-yellow">{metrics?.suppressedContacts ?? 0}</p></div>
      </div>

      <div className="card" style={{ padding: '1rem', marginTop: '1rem' }}>
        <h2>Rates</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Metric</th><th>Value</th></tr></thead>
            <tbody>
              <tr><td>Open Rate</td><td>{(metrics?.openRate ?? 0).toFixed(2)}%</td></tr>
              <tr><td>Click Rate</td><td>{(metrics?.clickRate ?? 0).toFixed(2)}%</td></tr>
              <tr><td>Bounce Rate</td><td>{(metrics?.bounceRate ?? 0).toFixed(2)}%</td></tr>
              <tr><td>Unsubscribe Rate</td><td>{(metrics?.unsubscribeRate ?? 0).toFixed(2)}%</td></tr>
              <tr><td>Spam Complaint Rate</td><td>{(metrics?.spamComplaintRate ?? 0).toFixed(2)}%</td></tr>
              <tr><td>Provider Block Rate</td><td>{(metrics?.providerBlockRate ?? 0).toFixed(2)}%</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: '1rem', marginTop: '1rem' }}>
        <h2>Detection</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Signal</th><th>Status</th><th>Value</th><th>Detail</th></tr></thead>
            <tbody>
              {(metrics?.detections || []).map((detection) => (
                <tr key={detection.key}>
                  <td>{detection.title}</td>
                  <td><span className={`badge ${detectionBadgeClass(detection.status)}`}>{detection.status}</span></td>
                  <td>{detection.unit === 'percent' ? `${detection.value.toFixed(2)}%` : detection.count}</td>
                  <td>{detection.detail}</td>
                </tr>
              ))}
              {(!metrics?.detections || metrics.detections.length === 0) ? <tr><td colSpan={4}>No detection data yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: '1rem', marginTop: '1rem' }}>
        <h2>Audience Status</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Status</th><th>Contacts</th></tr></thead>
            <tbody>
              <tr><td>Subscribed</td><td>{metrics?.contactStats.subscribed ?? 0}</td></tr>
              <tr><td>Bounced</td><td>{metrics?.contactStats.bounced ?? 0}</td></tr>
              <tr><td>Unsubscribed</td><td>{metrics?.contactStats.unsubscribed ?? 0}</td></tr>
              <tr><td>Total</td><td>{metrics?.contactStats.total ?? 0}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: '1rem', marginTop: '1rem' }}>
        <h2>Recipient Event Details</h2>
        <p className="form-note" style={{ marginBottom: '0.75rem' }}>
          This table shows the actual recipient email addresses behind the tracked events in the current filter window.
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Email</th>
                <th>Campaign</th>
                <th>List</th>
                <th>Contact Status</th>
                <th>Provider</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {eventDetails.length === 0 ? (
                <tr><td colSpan={7}>No recipient event details found for these filters.</td></tr>
              ) : eventDetails.map((event) => (
                <tr key={event.id}>
                  <td>{event.type}</td>
                  <td>{event.email || '-'}</td>
                  <td>{event.campaignName || '-'}</td>
                  <td>{event.listName || '-'}</td>
                  <td>{event.contactStatus || '-'}</td>
                  <td>{event.provider || '-'}</td>
                  <td>{formatEventTime(event.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="stats-grid" style={{ marginTop: '1rem' }}>
        <div className="card" style={{ padding: '1rem' }}>
          <h2 style={{ marginBottom: '0.75rem' }}>Opened Emails</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Email</th><th>Campaign</th><th>Time</th></tr></thead>
              <tbody>
                {openedEvents.length === 0 ? <tr><td colSpan={3}>No opened emails yet.</td></tr> : openedEvents.slice(0, 50).map((event) => (
                  <tr key={event.id}>
                    <td>{event.email || '-'}</td>
                    <td>{event.campaignName || '-'}</td>
                    <td>{formatEventTime(event.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <h2 style={{ marginBottom: '0.75rem' }}>Bounced Emails</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Email</th><th>Campaign</th><th>Time</th></tr></thead>
              <tbody>
                {bouncedEvents.length === 0 ? <tr><td colSpan={3}>No bounced emails yet.</td></tr> : bouncedEvents.slice(0, 50).map((event) => (
                  <tr key={event.id}>
                    <td>{event.email || '-'}</td>
                    <td>{event.campaignName || '-'}</td>
                    <td>{formatEventTime(event.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <h2 style={{ marginBottom: '0.75rem' }}>Unsubscribed Emails</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Email</th><th>Campaign</th><th>Time</th></tr></thead>
              <tbody>
                {unsubscribedEvents.length === 0 ? <tr><td colSpan={3}>No unsubscribed emails yet.</td></tr> : unsubscribedEvents.slice(0, 50).map((event) => (
                  <tr key={event.id}>
                    <td>{event.email || '-'}</td>
                    <td>{event.campaignName || '-'}</td>
                    <td>{formatEventTime(event.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <h2 style={{ marginBottom: '0.75rem' }}>Delivered Emails</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Email</th><th>Campaign</th><th>Time</th></tr></thead>
              <tbody>
                {deliveredEvents.length === 0 ? <tr><td colSpan={3}>No delivered emails yet.</td></tr> : deliveredEvents.slice(0, 50).map((event) => (
                  <tr key={event.id}>
                    <td>{event.email || '-'}</td>
                    <td>{event.campaignName || '-'}</td>
                    <td>{formatEventTime(event.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
