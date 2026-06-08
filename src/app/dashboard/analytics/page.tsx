'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

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
  };
  campaigns: Array<{ id: string; name: string; listId: string; ownerEmail?: string; ownerName?: string | null; ownerRole?: string }>;
  lists: Array<{ id: string; name: string; ownerEmail?: string; ownerName?: string | null; ownerRole?: string }>;
};

type EventDetailsResponse = {
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
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
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
  const [events, setEvents] = useState<EventDetailsResponse | null>(null);
  const [campaignId, setCampaignId] = useState('');
  const [listId, setListId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const loadSummary = useCallback(async () => {
    const params = new URLSearchParams();
    if (campaignId) params.set('campaignId', campaignId);
    if (listId) params.set('listId', listId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const response = await fetch(`/api/analytics/summary?${params.toString()}`, { cache: 'no-store' });
    const data = (await response.json()) as SummaryResponse;
    setSummary(data);
  }, [campaignId, listId, from, to]);

  const loadEvents = useCallback(async (nextPage = 1) => {
    const params = new URLSearchParams();
    if (campaignId) params.set('campaignId', campaignId);
    if (listId) params.set('listId', listId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('page', String(nextPage));
    params.set('pageSize', '25');

    const response = await fetch(`/api/analytics/events?${params.toString()}`, { cache: 'no-store' });
    const data = (await response.json()) as EventDetailsResponse;
    setEvents(data);
  }, [campaignId, listId, from, to]);

  useEffect(() => {
    void loadSummary();
    void loadEvents(1);
  }, [loadSummary, loadEvents]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    void loadSummary();
    void loadEvents(1);
  }

  const metrics = summary?.metrics;
  const eventDetails = events?.eventDetails || [];
  const eventPagination = events?.pagination;
  const totalEventPages = eventPagination?.totalPages || 1;

  function formatEventTime(value: string) {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return value;
    return new Date(parsed).toLocaleString();
  }

  function goToEventPage(nextPage: number) {
    const bounded = Math.min(Math.max(1, nextPage), totalEventPages);
    void loadEvents(bounded);
  }

  return (
    <div className="overview analytics-page">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h1>Analytics</h1>
            <p>Track campaign performance with filterable event metrics.</p>
          </div>
        </div>
      </header>

      <section className="card analytics-panel analytics-filters-panel">
        <div className="section-header section-header--compact">
          <div>
            <p className="admin-eyebrow">Filters</p>
            <h2>Scope your report</h2>
            <p>Choose a campaign, list, or date range before refreshing the summary and event detail tables.</p>
          </div>
        </div>
        <form className="analytics-filter-form" onSubmit={applyFilters}>
          <label className="analytics-filter-field">
            <span>Campaign</span>
            <select className="status-select" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">All Campaigns</option>
              {summary?.campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}{campaign.ownerEmail ? ` - ${campaign.ownerName || campaign.ownerEmail}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="analytics-filter-field">
            <span>List</span>
            <select className="status-select" value={listId} onChange={(e) => setListId(e.target.value)}>
              <option value="">All Lists</option>
              {(events?.lists || summary?.lists || []).map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}{list.ownerEmail ? ` - ${list.ownerName || list.ownerEmail}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="analytics-filter-field">
            <span>From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="analytics-filter-field">
            <span>To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <div className="analytics-filter-actions">
            <button className="btn-primary" type="submit">Apply Filters</button>
          </div>
        </form>
      </section>

      <div className="stats-grid analytics-stats-grid">
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

      <section className="card analytics-panel" style={{ marginTop: '1rem' }}>
        <div className="section-header section-header--compact">
          <div>
            <p className="admin-eyebrow">Rates</p>
            <h2>Delivery and engagement ratios</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table analytics-table">
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
      </section>

      <section className="card analytics-panel" style={{ marginTop: '1rem' }}>
        <div className="section-header section-header--compact">
          <div>
            <p className="admin-eyebrow">Detection</p>
            <h2>Health signals</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table analytics-table">
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
      </section>

      <section className="card analytics-panel" style={{ marginTop: '1rem' }}>
        <div className="section-header section-header--compact">
          <div>
            <p className="admin-eyebrow">Audience Status</p>
            <h2>Suppression mix</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table analytics-table">
            <thead><tr><th>Status</th><th>Contacts</th></tr></thead>
            <tbody>
              <tr><td>Subscribed</td><td>{metrics?.contactStats.subscribed ?? 0}</td></tr>
              <tr><td>Bounced</td><td>{metrics?.contactStats.bounced ?? 0}</td></tr>
              <tr><td>Unsubscribed</td><td>{metrics?.contactStats.unsubscribed ?? 0}</td></tr>
              <tr><td>Total</td><td>{metrics?.contactStats.total ?? 0}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card analytics-panel" style={{ marginTop: '1rem' }}>
        <div className="section-header section-header--compact">
          <div>
            <p className="admin-eyebrow">Recipient Event Details</p>
            <h2>Paginated activity feed</h2>
            <p className="form-note">
              This table shows a paginated slice of the tracked events behind the current filter window.
            </p>
          </div>
        </div>
        <div className="pagination-controls analytics-pagination-controls" style={{ marginBottom: '0.75rem' }}>
          <span>
            Page {eventPagination?.page || 1} of {eventPagination?.totalPages || 1}
            {' '}
            {eventPagination ? `(${eventPagination.total} events total)` : ''}
          </span>
          <div className="pagination-actions">
            <button className="mini-btn" type="button" onClick={() => goToEventPage((eventPagination?.page || 1) - 1)} disabled={(eventPagination?.page || 1) <= 1}>
              Previous
            </button>
            <button className="mini-btn" type="button" onClick={() => goToEventPage((eventPagination?.page || 1) + 1)} disabled={(eventPagination?.page || 1) >= totalEventPages}>
              Next
            </button>
          </div>
        </div>
        <div className="table-wrap analytics-table-wrap">
          <table className="data-table analytics-table analytics-events-table">
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
      </section>
    </div>
  );
}
