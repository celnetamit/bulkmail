'use client';

import { ChangeEvent, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconHelp, IconImport, IconPlus } from '@/components/dashboard-icons';

type Campaign = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  status: string;
  provider: string | null;
  isArchived?: number | boolean;
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
  listCount: number;
  lists?: { id: string; name: string; isDefaultTestList: number | boolean }[];
  template: { id: string; name: string } | null;
  owner?: { id: string; email: string; name: string | null; role: string };
  isOwner?: boolean;
};

type BulkCampaignResponse = {
  error?: string;
  success?: boolean;
  action?: string;
  campaignIds?: string[];
  createdCampaignIds?: string[];
  targetListIds?: string[];
  campaigns?: Campaign[];
};

type ListOption = {
  id: string;
  name: string;
  isArchived?: number | boolean;
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
  const campaignImportRef = useRef<HTMLInputElement | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [lists, setLists] = useState<ListOption[]>([]);
  const [message, setMessage] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [retargetListIds, setRetargetListIds] = useState<string[]>([]);

  const loadAll = useCallback(async () => {
    const [campaignsRes, listsRes] = await Promise.all([
      fetch(`/api/campaigns${showArchived ? '?includeArchived=true' : ''}`, { cache: 'no-store' }),
      fetch('/api/lists?all=true&owner=self', { cache: 'no-store' }),
    ]);
    const campaignsData = (await campaignsRes.json()) as { campaigns: Campaign[] };
    const listsData = (await listsRes.json()) as { lists: ListOption[] };
    setCampaigns(campaignsData.campaigns || []);
    setLists(listsData.lists || []);
    setSelectedCampaignIds([]);
  }, [showArchived]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const activeCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.status === 'QUEUED' || campaign.status === 'RETRYING' || campaign.status === 'SENDING') || null,
    [campaigns],
  );
  useEffect(() => {
    if (!activeCampaign) return undefined;

    const interval = window.setInterval(() => {
      loadAll();
    }, 2000);

    return () => window.clearInterval(interval);
  }, [activeCampaign, loadAll]);

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
  const activeCampaignProgress = activeCampaign
    ? activeCampaign.totalRecipients > 0
      ? Math.min(100, (activeCampaign.sentCount / activeCampaign.totalRecipients) * 100)
      : activeCampaign.status === 'QUEUED'
        ? 6
        : activeCampaign.status === 'RETRYING'
        ? 6
        : 0
    : 0;

  const selectedCampaignCount = selectedCampaignIds.length;
  const selectableCampaigns = campaigns.filter((campaign) => campaign.isOwner !== false);
  const allVisibleSelected = selectableCampaigns.length > 0 && selectableCampaigns.every((campaign) => selectedCampaignIds.includes(campaign.id));

  function toggleSelectedCampaign(id: string) {
    const campaign = campaigns.find((entry) => entry.id === id);
    if (campaign && campaign.isOwner === false) return;
    setSelectedCampaignIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  function toggleSelectAllVisibleCampaigns() {
    if (campaigns.length === 0) return;
    const visibleIds = campaigns.filter((campaign) => campaign.isOwner !== false).map((campaign) => campaign.id);
    const allSelected = visibleIds.every((id) => selectedCampaignIds.includes(id));
    setSelectedCampaignIds(allSelected ? [] : visibleIds);
  }

  async function runBulkCampaignAction(action: 'archive' | 'unarchive' | 'duplicate' | 'retarget') {
    if (selectedCampaignIds.length === 0) return;
    if (action === 'retarget' && retargetListIds.length === 0) {
      setMessage('Choose at least one retarget list first.');
      return;
    }

    setBulkLoading(true);
    setMessage('');
    const response = await fetch('/api/campaigns/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action,
        campaignIds: selectedCampaignIds,
        targetListIds: retargetListIds,
      }),
    });
    const data = (await response.json()) as BulkCampaignResponse;
    setBulkLoading(false);
    if (!response.ok) {
      setMessage(data.error || `Failed to ${action} campaigns.`);
      return;
    }

    setSelectedCampaignIds([]);
    setMessage(
      action === 'duplicate'
        ? `${data.createdCampaignIds?.length || selectedCampaignIds.length} campaign${(data.createdCampaignIds?.length || selectedCampaignIds.length) === 1 ? '' : 's'} duplicated.`
        : action === 'retarget'
          ? `${selectedCampaignIds.length} campaign${selectedCampaignIds.length === 1 ? '' : 's'} retargeted.`
          : `${selectedCampaignIds.length} campaign${selectedCampaignIds.length === 1 ? '' : 's'} ${action === 'archive' ? 'archived' : 'restored'}.`,
    );
    await loadAll();
  }

  async function exportCampaigns(campaignIds: string[]) {
    if (campaignIds.length === 0) return;
    const response = await fetch(`/api/campaigns/export?campaignIds=${encodeURIComponent(campaignIds.join(','))}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Failed to export campaigns.');
      return;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `campaigns-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`Exported ${campaignIds.length} campaign${campaignIds.length === 1 ? '' : 's'}.`);
  }

  async function importCampaigns(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    let payload: unknown;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      setMessage('Import file must be valid JSON.');
      return;
    }

    setBulkLoading(true);
    const response = await fetch('/api/campaigns/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as BulkCampaignResponse;
    setBulkLoading(false);
    if (!response.ok) {
      setMessage(data.error || 'Failed to import campaigns.');
      return;
    }

    setMessage(`Imported ${data.createdCampaignIds?.length || 0} campaign${(data.createdCampaignIds?.length || 0) === 1 ? '' : 's'}.`);
    await loadAll();
  }

  async function updateStatus(campaign: Campaign, status: string) {
    const selectedListIds = (campaign.lists && campaign.lists.length > 0 ? campaign.lists : [campaign.list]).map((list) => list.id);
    const res = await fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: campaign.name,
        subject: campaign.subject,
        bodyHtml: campaign.bodyHtml,
        status,
        listIds: selectedListIds,
        listId: selectedListIds[0] || null,
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

  async function testCampaign(id: string) {
    setTestingId(id);
    const res = await fetch(`/api/campaigns/${id}/test`, { method: 'POST' });
    const data = (await res.json()) as { error?: string; sentCount?: number; failedCount?: number; testList?: { name?: string } };
    setTestingId(null);
    if (!res.ok) return setMessage(data.error || 'Failed to send test campaign.');
    setMessage(`Test sent to ${data.testList?.name || 'your test list'}. Sent: ${data.sentCount ?? 0}, Failed: ${data.failedCount ?? 0}.`);
  }

  async function sendCampaign(id: string) {
    setSendingId(id);
    const res = await fetch(`/api/campaigns/${id}/send`, { method: 'POST' });
    const data = (await res.json()) as {
      error?: string;
      queued?: boolean;
      jobId?: string;
      sentCount?: number;
      provider?: string;
      quotaSkippedCount?: number;
      remainingToday?: number;
      risk?: { items?: { title: string; severity: string }[] };
    };
    setSendingId(null);
    if (!res.ok) {
      const blockers = data.risk?.items?.filter((item) => item.severity === 'block').map((item) => item.title).slice(0, 3) || [];
      return setMessage(blockers.length > 0 ? `${data.error || 'Failed to send campaign.'} Fix: ${blockers.join(', ')}.` : data.error || 'Failed to send campaign.');
    }
    if (data.queued) {
      setMessage(`Campaign queued${data.jobId ? ` as job ${data.jobId}` : ''}. It will send in the background.`);
    } else {
      const quotaNote = data.quotaSkippedCount ? ` ${data.quotaSkippedCount} skipped because of the daily limit.` : '';
      setMessage(`Campaign sent via ${data.provider}. Sent count: ${data.sentCount ?? 0}.${quotaNote}`);
    }
    await loadAll();
  }

  return (
    <div className="overview">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h1>Campaigns</h1>
            <p>Keep the campaign list readable, then jump into the dedicated builder when you are ready to create or edit.</p>
          </div>
          <div className="header-actions">
            <button className="btn-secondary btn-secondary--with-icon" type="button" onClick={() => router.push('/dashboard/campaigns/create')}>
              <IconPlus className="btn-icon" aria-hidden="true" />
              New Campaign
            </button>
            <button className="btn-secondary btn-secondary--with-icon" type="button" onClick={() => campaignImportRef.current?.click()}>
              <IconImport className="btn-icon" aria-hidden="true" />
              Import
            </button>
            <Link className="btn-secondary btn-secondary--with-icon" href="/dashboard/help">
              <IconHelp className="btn-icon" aria-hidden="true" />
              Help
            </Link>
          </div>
        </div>
      </header>

      {message ? <p className="form-note">{message}</p> : null}

      <div className="stats-grid dashboard-stats">
        <div className="stat-card"><h3>Sent Campaigns</h3><p className="stat-value">{summary.sentCampaigns}</p></div>
        <div className="stat-card"><h3>Total Sent</h3><p className="stat-value">{summary.sent}</p></div>
        <div className="stat-card"><h3>Opened</h3><p className="stat-value">{summary.opened}</p></div>
        <div className="stat-card"><h3>Bounced</h3><p className="stat-value text-red">{summary.bounced}</p></div>
        <div className="stat-card"><h3>Unsubscribed</h3><p className="stat-value text-yellow">{summary.unsubscribed}</p></div>
        <div className="stat-card"><h3>Avg Open Rate</h3><p className="stat-value">{formatPercent(summary.averageOpenRate)}</p></div>
      </div>

      <input
        ref={campaignImportRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={importCampaigns}
      />

      {activeCampaign ? (
        <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>
            {activeCampaign.status === 'QUEUED' ? 'Queued for Send' : activeCampaign.status === 'RETRYING' ? 'Retrying Send' : 'Sending Now'}
          </h2>
          <p className="form-note" style={{ marginBottom: '0.75rem' }}>
            {activeCampaign.name} is {
              activeCampaign.status === 'QUEUED'
                ? 'queued to send'
                : activeCampaign.status === 'RETRYING'
                  ? 'waiting for a retry'
                  : `sending ${activeCampaign.sentCount}/${activeCampaign.totalRecipients} emails`
            }.
          </p>
          <div className="progress-track" aria-hidden="true">
            <div className="progress-bar" style={{ width: `${activeCampaignProgress}%` }} />
          </div>
        </div>
      ) : null}

      <div className="card" style={{ padding: '0.9rem 1rem', marginBottom: '1rem' }}>
        <div className="bulk-action-bar" style={{ marginBottom: '0.75rem' }}>
          <div className="bulk-action-bar__summary">
            <strong>{selectedCampaignCount}</strong> selected
          </div>
          <div className="bulk-action-bar__actions">
            <button className="mini-btn" type="button" onClick={() => runBulkCampaignAction('archive')} disabled={bulkLoading || selectedCampaignCount === 0}>
              Archive
            </button>
            <button className="mini-btn" type="button" onClick={() => runBulkCampaignAction('unarchive')} disabled={bulkLoading || selectedCampaignCount === 0}>
              Unarchive
            </button>
            <button className="mini-btn" type="button" onClick={() => runBulkCampaignAction('duplicate')} disabled={bulkLoading || selectedCampaignCount === 0}>
              Duplicate
            </button>
            <button className="mini-btn" type="button" onClick={() => runBulkCampaignAction('retarget')} disabled={bulkLoading || selectedCampaignCount === 0 || retargetListIds.length === 0}>
              Retarget
            </button>
            <button className="mini-btn" type="button" onClick={() => exportCampaigns(selectedCampaignIds)} disabled={bulkLoading || selectedCampaignCount === 0}>
              Export
            </button>
            <button className="mini-btn danger" type="button" onClick={() => setSelectedCampaignIds([])} disabled={bulkLoading || selectedCampaignCount === 0}>
              Clear
            </button>
          </div>
        </div>
        <div className="bulk-retarget-panel">
          <label>
            <span style={{ display: 'block', marginBottom: '0.35rem', color: '#cbd5e1' }}>Retarget to lists</span>
            <select
              multiple
              size={Math.min(5, Math.max(2, lists.length || 2))}
              className="status-select bulk-retarget-select"
              value={retargetListIds}
              onChange={(event) => setRetargetListIds(Array.from(event.target.selectedOptions).map((option) => option.value))}
            >
              {lists.length === 0 ? <option value="" disabled>No lists available</option> : null}
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </label>
          <p className="form-note" style={{ marginTop: '0.5rem' }}>
            Choose one or more lists before retargeting the selected campaigns.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="table-topbar">
          <label className="inline-toggle">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            <span>Show archived</span>
          </label>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisibleCampaigns}
                    aria-label="Select all visible campaigns"
                  />
                </th>
                <th>Name</th>
                <th>List</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Timing</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? <tr><td colSpan={7}>No campaigns yet.</td></tr> : campaigns.map((c) => {
                const canManageCampaign = c.isOwner !== false;
                return (
                <tr key={c.id} className={selectedCampaignIds.includes(c.id) ? 'is-selected-row--bulk' : ''}>
                  <td onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedCampaignIds.includes(c.id)}
                      onChange={() => toggleSelectedCampaign(c.id)}
                      disabled={!canManageCampaign}
                      aria-label={`Select campaign ${c.name}`}
                    />
                  </td>
                  <td>
                    <div>{c.name}</div>
                    {c.owner ? (
                      <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: '#64748b' }}>
                        Owner: {c.owner.name || c.owner.email} ({c.owner.role})
                      </div>
                    ) : null}
                    {c.isArchived ? <div className="badge badge-warning" style={{ display: 'inline-flex', marginTop: '0.35rem' }}>Archived</div> : null}
                    {!canManageCampaign ? <div className="badge badge-info" style={{ display: 'inline-flex', marginTop: '0.35rem' }}>Read-only</div> : null}
                  </td>
                  <td>
                    <div>{c.list.name}</div>
                    <div style={{ marginTop: '0.25rem' }}>
                      <span className="badge" style={{ display: 'inline-flex' }}>
                        {c.listCount || 1} list{(c.listCount || 1) === 1 ? '' : 's'} selected
                      </span>
                    </div>
                    <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                      {(c.lists || [c.list]).map((list) => list.name).join(', ')}
                    </div>
                  </td>
                  <td>
                    <div className={`badge ${c.status === 'SENT' ? 'badge-success' : c.status === 'FAILED' || c.status === 'QUEUED' || c.status === 'RETRYING' ? 'badge-warning' : ''}`} style={{ display: 'inline-flex', marginBottom: '0.35rem' }}>{c.status}</div>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{c.status === 'QUEUED' || c.status === 'RETRYING' ? c.status.toLowerCase() : c.provider || 'mock'}</div>
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
                    {c.finishedAt ? `Finished ${new Date(c.finishedAt).toLocaleString()}` : c.status === 'QUEUED' ? 'Queued' : c.status === 'RETRYING' ? 'Retrying' : c.status === 'SENDING' ? 'In progress' : '-'}
                    <br />
                    Duration: {formatDuration(c.durationSeconds)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <button
                        className="mini-btn"
                        type="button"
                        onClick={() => router.push(`/dashboard/campaigns/create?campaignId=${c.id}`)}
                        disabled={!canManageCampaign || c.status === 'QUEUED' || c.status === 'RETRYING' || c.status === 'SENDING' || Boolean(c.isArchived)}
                      >
                        Edit Draft
                      </button>
                      <button className="mini-btn" type="button" onClick={() => duplicateCampaign(c.id)} disabled={!canManageCampaign}>Copy</button>
                      <button className="mini-btn" type="button" onClick={() => testCampaign(c.id)} disabled={!canManageCampaign || testingId === c.id || Boolean(c.isArchived)}>
                        {testingId === c.id ? 'Testing...' : 'Test'}
                      </button>
                      <Link className="mini-btn" href={`/dashboard/analytics?campaignId=${c.id}`}>Stats</Link>
                    </div>
                    <div style={{ marginTop: '0.4rem' }}>
                      <select className="status-select" value={c.status} onChange={(e) => updateStatus(c, e.target.value)} disabled={!canManageCampaign || c.status === 'QUEUED' || c.status === 'RETRYING' || c.status === 'SENDING' || Boolean(c.isArchived)}>
                        <option>DRAFT</option><option>SCHEDULED</option><option>QUEUED</option><option>RETRYING</option><option>SENDING</option><option>SENT</option><option>FAILED</option><option>SKIPPED</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.4rem' }}>
                      <button
                        className="mini-btn"
                        type="button"
                        onClick={() => sendCampaign(c.id)}
                        disabled={!canManageCampaign || sendingId === c.id || c.status === 'QUEUED' || c.status === 'RETRYING' || c.status === 'SENDING' || Boolean(c.isArchived)}
                      >
                        {sendingId === c.id ? 'Sending...' : c.status === 'QUEUED' || c.status === 'RETRYING' || c.status === 'SENDING' ? c.status : 'Send'}
                      </button>
                      <button className="mini-btn danger" type="button" onClick={() => deleteCampaign(c.id)} disabled={!canManageCampaign || c.status === 'QUEUED' || c.status === 'RETRYING' || c.status === 'SENDING'}>Delete</button>
                      <button
                        className="mini-btn"
                        type="button"
                        onClick={async () => {
                          if (!confirm('Reset this campaign to a fresh state? This will clear send counts and remove queued jobs.')) return;
                          const res = await fetch(`/api/campaigns/${c.id}/reset`, { method: 'POST' });
                          if (!res.ok) return setMessage('Failed to reset campaign.');
                          setMessage('Campaign reset to fresh state.');
                          await loadAll();
                        }}
                        disabled={!canManageCampaign || c.status === 'QUEUED' || c.status === 'RETRYING' || c.status === 'SENDING' || Boolean(c.isArchived)}
                      >
                        Reset
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
