'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/toast-provider';

type HousekeepingRunSummary = {
  triggeredBy: string;
  mode: 'manual' | 'cron';
  startedAt: string;
  finishedAt: string | null;
  skippedReason?: 'disabled' | 'not_due' | 'locked';
  scopes: string[];
  affected: {
    auditLogsDeleted: number;
    systemEventsDeleted: number;
    sendJobsDeleted: number;
    campaignsArchived: number;
    archivedCampaignsDeleted: number;
  };
};

type HousekeepingSettings = {
  isEnabled: boolean;
  runEveryMinutes: number;
  auditLogRetentionDays: number;
  systemEventRetentionDays: number;
  sendJobRetentionDays: number;
  autoArchiveCampaignDays: number;
  archivedCampaignRetentionDays: number;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastStatus: string | null;
  lastTriggeredBy: string | null;
  lastSummary: HousekeepingRunSummary | null;
  lockExpiresAt: string | null;
};

type HousekeepingSnapshot = {
  auditLogsEligible: number;
  systemEventsEligible: number;
  sendJobsEligible: number;
  campaignsToArchive: number;
  archivedCampaignsToPurge: number;
};

type ApiResponse = {
  settings: HousekeepingSettings;
  snapshot: HousekeepingSnapshot;
  summary?: HousekeepingRunSummary;
  error?: string;
};

type HousekeepingAction =
  | 'full'
  | 'auditLogs'
  | 'systemEvents'
  | 'sendJobs'
  | 'archiveCampaigns'
  | 'purgeArchivedCampaigns';

const ACTIONS: Array<{ key: HousekeepingAction; label: string; detail: string }> = [
  { key: 'full', label: 'Run Full Housekeeping', detail: 'Apply all cleanup and archive rules immediately.' },
  { key: 'archiveCampaigns', label: 'Archive Old Campaigns', detail: 'Move completed campaigns out of the default list view.' },
  { key: 'purgeArchivedCampaigns', label: 'Purge Archived Campaigns', detail: 'Delete archived campaigns older than the retention target.' },
  { key: 'sendJobs', label: 'Prune Send Jobs', detail: 'Remove finished queue jobs after the send-job retention window.' },
  { key: 'auditLogs', label: 'Prune Audit Trail', detail: 'Delete older audit entries beyond the configured retention.' },
  { key: 'systemEvents', label: 'Prune System Events', detail: 'Trim observability history based on the event retention window.' },
];

function formatDate(value: string | null) {
  if (!value) return 'Never';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function formatSkippedReason(reason: HousekeepingRunSummary['skippedReason']) {
  if (reason === 'disabled') return 'Skipped because housekeeping is disabled.';
  if (reason === 'not_due') return 'Skipped because the cron window is not due yet.';
  if (reason === 'locked') return 'Skipped because another cleanup run still holds the lease.';
  return 'Completed.';
}

export default function HousekeepingClient() {
  const toast = useToast();
  const [settings, setSettings] = useState<HousekeepingSettings | null>(null);
  const [snapshot, setSnapshot] = useState<HousekeepingSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const [runningAction, setRunningAction] = useState<HousekeepingAction | null>(null);
  const [loading, setLoading] = useState(true);

  const [isEnabled, setIsEnabled] = useState(true);
  const [runEveryMinutes, setRunEveryMinutes] = useState('720');
  const [auditLogRetentionDays, setAuditLogRetentionDays] = useState('90');
  const [systemEventRetentionDays, setSystemEventRetentionDays] = useState('30');
  const [sendJobRetentionDays, setSendJobRetentionDays] = useState('30');
  const [autoArchiveCampaignDays, setAutoArchiveCampaignDays] = useState('30');
  const [archivedCampaignRetentionDays, setArchivedCampaignRetentionDays] = useState('180');

  async function load() {
    setLoading(true);
    const response = await fetch('/api/admin/housekeeping', { cache: 'no-store' });
    const data = (await response.json()) as ApiResponse;
    setLoading(false);

    if (!response.ok) {
      toast.error('Housekeeping load failed', data.error || 'The housekeeping settings could not be loaded.');
      return;
    }

    setSettings(data.settings);
    setSnapshot(data.snapshot);
    setIsEnabled(data.settings.isEnabled);
    setRunEveryMinutes(String(data.settings.runEveryMinutes));
    setAuditLogRetentionDays(String(data.settings.auditLogRetentionDays));
    setSystemEventRetentionDays(String(data.settings.systemEventRetentionDays));
    setSendJobRetentionDays(String(data.settings.sendJobRetentionDays));
    setAutoArchiveCampaignDays(String(data.settings.autoArchiveCampaignDays));
    setArchivedCampaignRetentionDays(String(data.settings.archivedCampaignRetentionDays));
  }

  useEffect(() => {
    load();
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);

    const response = await fetch('/api/admin/housekeeping', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        isEnabled,
        runEveryMinutes: Number(runEveryMinutes),
        auditLogRetentionDays: Number(auditLogRetentionDays),
        systemEventRetentionDays: Number(systemEventRetentionDays),
        sendJobRetentionDays: Number(sendJobRetentionDays),
        autoArchiveCampaignDays: Number(autoArchiveCampaignDays),
        archivedCampaignRetentionDays: Number(archivedCampaignRetentionDays),
      }),
    });

    const data = (await response.json()) as ApiResponse;
    setSaving(false);

    if (!response.ok) {
      toast.error('Housekeeping save failed', data.error || 'The housekeeping settings could not be saved.');
      return;
    }

    setSettings(data.settings);
    setSnapshot(data.snapshot);
    toast.success('Housekeeping settings saved', 'Retention rules and schedule settings were updated.');
  }

  async function runAction(action: HousekeepingAction) {
    setRunningAction(action);

    const response = await fetch('/api/admin/housekeeping', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action,
        force: true,
      }),
    });

    const data = (await response.json()) as ApiResponse;
    setRunningAction(null);

    if (!response.ok) {
      toast.error('Housekeeping run failed', data.error || 'The housekeeping run could not be completed.');
      return;
    }

    setSettings(data.settings);
    setSnapshot(data.snapshot);

    if (data.summary?.skippedReason) {
      toast.warning('Housekeeping skipped', formatSkippedReason(data.summary.skippedReason));
      return;
    }

    toast.success(
      action === 'full' ? 'Housekeeping completed' : 'Cleanup action completed',
      action === 'full'
        ? 'The full housekeeping routine finished successfully.'
        : `${ACTIONS.find((item) => item.key === action)?.label || 'The selected action'} finished successfully.`,
    );
  }

  const summaryRows = useMemo(() => {
    const summary = settings?.lastSummary;
    if (!summary) return [];
    return [
      ['Audit logs deleted', summary.affected.auditLogsDeleted],
      ['System events deleted', summary.affected.systemEventsDeleted],
      ['Send jobs deleted', summary.affected.sendJobsDeleted],
      ['Campaigns archived', summary.affected.campaignsArchived],
      ['Archived campaigns deleted', summary.affected.archivedCampaignsDeleted],
    ];
  }, [settings?.lastSummary]);

  return (
    <div className="overview housekeeping-page">
      <header className="page-header page-header__row">
        <div>
          <h1>Housekeeping</h1>
          <p>Manage cleanup retention, run maintenance on demand, and expose one cron-safe endpoint for routine upkeep.</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" type="button" onClick={load} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="stats-grid housekeeping-stats-grid">
        <div className="stat-card">
          <span>Audit logs ready</span>
          <strong>{snapshot?.auditLogsEligible ?? 0}</strong>
        </div>
        <div className="stat-card">
          <span>System events ready</span>
          <strong>{snapshot?.systemEventsEligible ?? 0}</strong>
        </div>
        <div className="stat-card">
          <span>Send jobs ready</span>
          <strong>{snapshot?.sendJobsEligible ?? 0}</strong>
        </div>
        <div className="stat-card">
          <span>Campaigns to archive</span>
          <strong>{snapshot?.campaignsToArchive ?? 0}</strong>
        </div>
        <div className="stat-card">
          <span>Archived to purge</span>
          <strong>{snapshot?.archivedCampaignsToPurge ?? 0}</strong>
        </div>
        <div className="stat-card">
          <span>Last status</span>
          <strong>{settings?.lastStatus || 'Idle'}</strong>
        </div>
      </div>

      <div className="cards-grid housekeeping-layout">
        <section className="card dashboard-panel housekeeping-panel">
          <div className="section-header section-header--compact">
            <div>
              <h2>Retention Settings</h2>
              <p>Choose how often cleanup runs and how long operational records should remain available.</p>
            </div>
            <span className={`pill ${settings?.isEnabled ? 'pill--success' : 'pill--warning'}`}>
              {settings?.isEnabled ? 'Enabled' : 'Paused'}
            </span>
          </div>

          <form className="housekeeping-form" onSubmit={save}>
            <label className="inline-toggle">
              <input type="checkbox" checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} />
              <span>Enable scheduled housekeeping runs</span>
            </label>

            <div className="housekeeping-grid">
              <label>
                Run every minutes
                <input type="number" min={0} step={15} value={runEveryMinutes} onChange={(event) => setRunEveryMinutes(event.target.value)} />
              </label>
              <label>
                Audit log retention days
                <input type="number" min={0} step={1} value={auditLogRetentionDays} onChange={(event) => setAuditLogRetentionDays(event.target.value)} />
              </label>
              <label>
                System event retention days
                <input type="number" min={0} step={1} value={systemEventRetentionDays} onChange={(event) => setSystemEventRetentionDays(event.target.value)} />
              </label>
              <label>
                Send job retention days
                <input type="number" min={0} step={1} value={sendJobRetentionDays} onChange={(event) => setSendJobRetentionDays(event.target.value)} />
              </label>
              <label>
                Auto-archive campaigns after days
                <input type="number" min={0} step={1} value={autoArchiveCampaignDays} onChange={(event) => setAutoArchiveCampaignDays(event.target.value)} />
              </label>
              <label>
                Purge archived campaigns after days
                <input type="number" min={0} step={1} value={archivedCampaignRetentionDays} onChange={(event) => setArchivedCampaignRetentionDays(event.target.value)} />
              </label>
            </div>

            <div className="housekeeping-form__actions">
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>

          <p className="form-note">
            Use <strong>0</strong> to disable a specific retention rule without disabling the whole housekeeping system.
          </p>
        </section>

        <section className="card dashboard-panel housekeeping-panel">
          <div className="section-header section-header--compact">
            <div>
              <h2>One-Click Actions</h2>
              <p>Run the full routine or a single cleanup step without waiting for the next cron window.</p>
            </div>
          </div>

          <div className="housekeeping-actions">
            {ACTIONS.map((action) => (
              <button
                key={action.key}
                className="housekeeping-action"
                type="button"
                onClick={() => runAction(action.key)}
                disabled={runningAction !== null}
              >
                <strong>{runningAction === action.key ? 'Running...' : action.label}</strong>
                <span>{action.detail}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="cards-grid housekeeping-layout">
        <section className="card dashboard-panel housekeeping-panel">
          <div className="section-header section-header--compact">
            <div>
              <h2>Last Run</h2>
              <p>See who triggered the most recent run, whether it was skipped, and what it changed.</p>
            </div>
          </div>

          <div className="housekeeping-meta">
            <div>
              <span>Started</span>
              <strong>{formatDate(settings?.lastStartedAt || null)}</strong>
            </div>
            <div>
              <span>Finished</span>
              <strong>{formatDate(settings?.lastFinishedAt || null)}</strong>
            </div>
            <div>
              <span>Triggered by</span>
              <strong>{settings?.lastTriggeredBy || 'Not recorded'}</strong>
            </div>
            <div>
              <span>Lease expires</span>
              <strong>{formatDate(settings?.lockExpiresAt || null)}</strong>
            </div>
          </div>

          <div className="housekeeping-summary">
            <p>{formatSkippedReason(settings?.lastSummary?.skippedReason)}</p>
            <ul className="housekeeping-summary__list">
              {summaryRows.length ? (
                summaryRows.map(([label, value]) => (
                  <li key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </li>
                ))
              ) : (
                <li>
                  <span>No cleanup run has been recorded yet.</span>
                  <strong>0</strong>
                </li>
              )}
            </ul>
          </div>
        </section>

        <section className="card dashboard-panel housekeeping-panel">
          <div className="section-header section-header--compact">
            <div>
              <h2>Cron Endpoint</h2>
              <p>Point your scheduler at a single protected endpoint. Cron runs respect the enabled flag, lease, and interval window.</p>
            </div>
          </div>

          <div className="housekeeping-callout">
            <code>/api/cron/housekeeping</code>
            <p className="form-note">
              Send a bearer token or <code>x-housekeeping-secret</code> header that matches <code>HOUSEKEEPING_CRON_SECRET</code>.
            </p>
            <p className="form-note">
              The routine skips safely if the previous lease is still active or the next run window has not arrived yet.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
