'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Campaign = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  status: string;
  provider: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  durationSeconds: number | null;
  openedCount: number;
  deliveredCount: number;
  bouncedCount: number;
  unsubscribedCount: number;
  listId: string;
  templateId: string | null;
  list: { id: string; name: string };
  template: { id: string; name: string } | null;
};

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return '-';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [message, setMessage] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const campaignsRes = await fetch('/api/campaigns', { cache: 'no-store' });
    const campaignsData = (await campaignsRes.json()) as { campaigns: Campaign[] };
    setCampaigns(campaignsData.campaigns || []);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const sendingCampaign = useMemo(() => campaigns.find((campaign) => campaign.status === 'SENDING') || null, [campaigns]);
  useEffect(() => {
    if (!sendingCampaign) return undefined;

    const interval = window.setInterval(() => {
      loadAll();
    }, 2000);

    return () => window.clearInterval(interval);
  }, [loadAll, sendingCampaign]);

  const sentCampaigns = useMemo(() => campaigns.filter((campaign) => campaign.status === 'SENT'), [campaigns]);
  const summary = useMemo(() => {
    const totals = sentCampaigns.reduce(
      (acc, campaign) => ({
        sent: acc.sent + campaign.sentCount,
        opened: acc.opened + campaign.openedCount,
        bounced: acc.bounced + campaign.bouncedCount,
        unsubscribed: acc.unsubscribed + campaign.unsubscribedCount,
      }),
      { sent: 0, opened: 0, bounced: 0, unsubscribed: 0 },
    );
    const averageOpenRate = totals.sent > 0 ? (totals.opened / totals.sent) * 100 : 0;
    return { ...totals, averageOpenRate, sentCampaigns: sentCampaigns.length };
  }, [sentCampaigns]);

  async function updateStatus(campaign: Campaign, status: string) {
    const res = await fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: campaign.name,
        subject: campaign.subject,
        bodyHtml: campaign.bodyHtml,
        status,
        listId: campaign.list?.id || null,
        templateId: campaign.template?.id || null,
      }),
    });
    if (!res.ok) return setMessage('Failed to update campaign.');
    setMessage('Campaign updated.');
    await loadAll();
  }

  async function deleteCampaign(id: string) {
    const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
    if (!res.ok) return setMessage('Failed to delete campaign.');
    setMessage('Campaign deleted.');
    await loadAll();
  }

  async function duplicateCampaign(id: string) {
    const res = await fetch(`/api/campaigns/${id}/duplicate`, { method: 'POST' });
    if (!res.ok) return setMessage('Failed to duplicate campaign.');
    setMessage('Campaign duplicated as a new draft.');
    await loadAll();
  }

  async function sendCampaign(id: string) {
    setSendingId(id);
    const res = await fetch(`/api/campaigns/${id}/send`, { method: 'POST' });
    const data = (await res.json()) as { error?: string; sentCount?: number; provider?: string; quotaSkippedCount?: number; remainingToday?: number };
    setSendingId(null);
    if (!res.ok) return setMessage(data.error || 'Failed to send campaign.');
    const quotaNote = data.quotaSkippedCount ? ` ${data.quotaSkippedCount} skipped because of the daily limit.` : '';
    setMessage(`Campaign sent via ${data.provider}. Sent count: ${data.sentCount ?? 0}.${quotaNote}`);
    await loadAll();
  }

  return (
    <div className="overview">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h1>Campaigns</h1>
            <p>Create drafts on a separate page, duplicate sent campaigns, and track performance.</p>
          </div>
          <button className="btn-secondary" type="button" onClick={() => router.push('/dashboard/campaigns/create')}>
            New Campaign
          </button>
        </div>
      </header>

      {message ? <p className="form-note">{message}</p> : null}

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card"><h3>Sent Campaigns</h3><p className="stat-value">{summary.sentCampaigns}</p></div>
        <div className="stat-card"><h3>Total Sent</h3><p className="stat-value">{summary.sent}</p></div>
        <div className="stat-card"><h3>Opened</h3><p className="stat-value">{summary.opened}</p></div>
        <div className="stat-card"><h3>Bounced</h3><p className="stat-value text-red">{summary.bounced}</p></div>
        <div className="stat-card"><h3>Unsubscribed</h3><p className="stat-value text-yellow">{summary.unsubscribed}</p></div>
        <div className="stat-card"><h3>Avg Open Rate</h3><p className="stat-value">{formatPercent(summary.averageOpenRate)}</p></div>
      </div>

      {sendingCampaign ? (
        <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Sending Now</h2>
          <p className="form-note" style={{ marginBottom: '0.75rem' }}>{sendingCampaign.name} is sending {sendingCampaign.sentCount}/{sendingCampaign.totalRecipients} emails.</p>
          <div className="progress-track" aria-hidden="true">
            <div className="progress-bar" style={{ width: `${sendingCampaign.totalRecipients > 0 ? Math.min(100, (sendingCampaign.sentCount / sendingCampaign.totalRecipients) * 100) : 0}%` }} />
          </div>
        </div>
      ) : null}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>List</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Timing</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? <tr><td colSpan={6}>No campaigns yet.</td></tr> : campaigns.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.list.name}</td>
                <td>
                  <div className={`badge ${c.status === 'SENT' ? 'badge-success' : c.status === 'FAILED' ? 'badge-warning' : ''}`} style={{ display: 'inline-flex', marginBottom: '0.35rem' }}>{c.status}</div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{c.provider || 'mock'}</div>
                </td>
                <td style={{ minWidth: '240px' }}>
                  <div className="progress-track" aria-hidden="true">
                    <div className="progress-bar" style={{ width: `${c.totalRecipients > 0 ? Math.min(100, (c.sentCount / c.totalRecipients) * 100) : 0}%` }} />
                  </div>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#94a3b8' }}>
                    {c.sentCount}/{c.totalRecipients} sent, {c.failedCount} failed, {c.skippedCount} skipped
                  </div>
                  <div style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                    {c.openedCount} opened, {c.bouncedCount} bounced, {c.unsubscribedCount} unsubscribed
                  </div>
                </td>
                <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem', color: '#cbd5e1' }}>
                  {c.startedAt ? `Started ${new Date(c.startedAt).toLocaleString()}` : '-'}
                  <br />
                  {c.finishedAt ? `Finished ${new Date(c.finishedAt).toLocaleString()}` : c.status === 'SENDING' ? 'In progress' : '-'}
                  <br />
                  Duration: {formatDuration(c.durationSeconds)}
                </td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    <button className="mini-btn" type="button" onClick={() => router.push(`/dashboard/campaigns/create?campaignId=${c.id}`)}>Edit Draft</button>
                    <button className="mini-btn" type="button" onClick={() => duplicateCampaign(c.id)}>Copy</button>
                    <Link className="mini-btn" href={`/dashboard/analytics?campaignId=${c.id}`}>Stats</Link>
                  </div>
                  <div style={{ marginTop: '0.4rem' }}>
                    <select className="status-select" value={c.status} onChange={(e) => updateStatus(c, e.target.value)}>
                      <option>DRAFT</option><option>SCHEDULED</option><option>SENDING</option><option>SENT</option><option>FAILED</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.4rem' }}>
                    <button className="mini-btn" type="button" onClick={() => sendCampaign(c.id)} disabled={sendingId === c.id}>{sendingId === c.id ? 'Sending...' : 'Send'}</button>
                    <button className="mini-btn danger" type="button" onClick={() => deleteCampaign(c.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
