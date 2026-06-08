'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { buildComplianceItems } from '@/lib/compliance';
import { APP_ROUTES, API_ROUTES } from '@/lib/routes';
import { useToast } from '@/components/toast-provider';

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  dailyEmailLimit: number;
  imageUploadLimitKb: number | null;
  lastLoginAt: string | null;
  createdAt: string;
  listsCount: number;
  templatesCount: number;
  campaignsCount: number;
  sentToday: number;
  contactCount: number;
  remainingToday: number;
  sentTotal: number;
  opened: number;
  delivered: number;
  bounced: number;
  unsubscribed: number;
  openRate: number;
  bounceRate: number;
  unsubscribeRate: number;
};

type SummaryResponse = {
  viewer: {
    userId: string;
    email: string;
    role: string;
  };
  totals: {
    users: number;
    activeUsers: number;
    campaigns: number;
    lists: number;
    contacts: number;
    suppressedContacts: number;
    sentToday: number;
    openTotal: number;
    bounceTotal: number;
    unsubscribeTotal: number;
  };
  users: UserRow[];
  recentAudits: Array<{
    id: string;
    actorUserId: string;
    actorEmail: string;
    actorRole: string;
    action: string;
    entityType: string;
    entityId: string | null;
    scopeType: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }>;
  recentSystemEvents: Array<{
    id: string;
    level: 'INFO' | 'WARN' | 'ERROR';
    source: string;
    message: string;
    userId: string | null;
    campaignId: string | null;
    details: Record<string, unknown> | null;
    createdAt: string;
  }>;
  systemAlerts: Array<{
    key: string;
    level: 'critical' | 'warning' | 'info';
    title: string;
    detail: string;
    action?: { label: string; href: string };
  }>;
  systemHealth: {
    uptimeSeconds: number;
    queue: {
      queued: number;
      running: number;
      retrying: number;
      failed: number;
      skipped: number;
    };
    recentErrors24h: number;
    recentWarnings24h: number;
    lastError: {
      message: string;
      source: string;
      createdAt: string;
    } | null;
    live: {
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
  };
};

type Settings = {
  provider: 'mock' | 'resend' | 'aws-ses';
  awsFromEmail: string;
  resendFromEmail: string;
  hasWebhookSharedSecret: boolean;
  sendingDomain: string;
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  source: 'database' | 'env';
};

function percent(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, (part / total) * 100);
}

type ComplianceStatus = 'ready' | 'manual' | 'action';

function statusLabel(status: ComplianceStatus) {
  if (status === 'ready') return 'Ready';
  if (status === 'manual') return 'Manual check';
  return 'Needs action';
}

function statusClass(status: ComplianceStatus) {
  if (status === 'ready') return 'badge-success';
  return 'badge-warning';
}

function alertClass(level: 'critical' | 'warning' | 'info') {
  if (level === 'critical') return 'badge-warning';
  if (level === 'warning') return 'badge-info';
  return 'badge-success';
}

function normalizeAlertFilter(value: string | null): 'all' | 'critical' | 'warning' | 'info' {
  if (value === 'critical' || value === 'warning' || value === 'info') return value;
  return 'all';
}

function normalizeDismissedAlerts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

export default function AdminDashboardClient() {
  const toast = useToast();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('USER');
  const [dailyEmailLimit, setDailyEmailLimit] = useState('100000');
  const [imageUploadLimitKb, setImageUploadLimitKb] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<UserRow>>>({});
  const [alertFilter, setAlertFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [dismissedAlertKeys, setDismissedAlertKeys] = useState<string[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'ADMIN' | 'MANAGER' | 'USER'>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  async function load() {
    const [overviewResponse, settingsResponse] = await Promise.all([
      fetch('/api/admin/overview', { cache: 'no-store' }),
      fetch('/api/settings', { cache: 'no-store' }),
    ]);

    const data = (await overviewResponse.json()) as SummaryResponse & { error?: string };
    if (!overviewResponse.ok) {
      toast.error('Admin overview failed', data.error || 'The admin dashboard data could not be loaded.');
      return;
    }
    setSummary(data);

    if (settingsResponse.ok) {
      const settingsData = (await settingsResponse.json()) as { settings?: Settings };
      setSettings(settingsData.settings || null);
    } else {
      setSettings(null);
    }

    const nextDrafts: Record<string, Partial<UserRow>> = {};
    for (const user of data.users || []) {
      nextDrafts[user.id] = {
        name: user.name || '',
        role: user.role,
        isActive: user.isActive,
        dailyEmailLimit: user.dailyEmailLimit,
        imageUploadLimitKb: user.imageUploadLimitKb,
      };
    }
    setDrafts(nextDrafts);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!summary?.viewer?.userId) return;

    const storageKey = `mailflow_admin_alerts:${summary.viewer.userId}`;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        filter?: string;
        dismissed?: unknown;
      };

      setAlertFilter(normalizeAlertFilter(parsed.filter || null));
      setDismissedAlertKeys(normalizeDismissedAlerts(parsed.dismissed));
    } catch {
      // Ignore malformed session state.
    }
  }, [summary?.viewer?.userId]);

  useEffect(() => {
    if (!summary?.viewer?.userId) return;

    const storageKey = `mailflow_admin_alerts:${summary.viewer.userId}`;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          filter: alertFilter,
          dismissed: dismissedAlertKeys,
        }),
      );
    } catch {
      // Ignore storage failures in private browsing / storage-restricted modes.
    }
  }, [alertFilter, dismissedAlertKeys, summary?.viewer?.userId]);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          role,
          dailyEmailLimit: Number(dailyEmailLimit),
          imageUploadLimitKb: imageUploadLimitKb ? Number(imageUploadLimitKb) : null,
        }),
      });

    const data = await response.json();
    if (!response.ok) {
      toast.error('User creation failed', data.error || 'The user could not be created.');
      return;
    }

    toast.success('User created', data.user.email);
    setName('');
    setEmail('');
    setRole('USER');
    setDailyEmailLimit('100000');
    setImageUploadLimitKb('');
    await load();
  }

  function updateDraft(id: string, field: string, value: string | boolean | number | null) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        [field]: value,
      },
    }));
  }

  async function saveUser(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);

    const response = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          role: draft.role,
          isActive: draft.isActive,
          dailyEmailLimit: draft.dailyEmailLimit,
          imageUploadLimitKb: draft.imageUploadLimitKb,
        }),
      });

    const data = await response.json();
    setSavingId(null);
    if (!response.ok) {
      toast.error('User update failed', data.error || 'The user could not be updated.');
      return;
    }

    toast.success('User updated', data.user.email);
    await load();
  }

  const rows = useMemo(() => summary?.users || [], [summary]);
  const filteredRows = useMemo(() => {
    const query = userQuery.trim().toLowerCase();
    return rows.filter((user) => {
      const draft = drafts[user.id] || {};
      const roleValue = String(draft.role || user.role) as 'ADMIN' | 'MANAGER' | 'USER';
      const isActiveValue = Boolean(draft.isActive ?? user.isActive);
      const haystack = [
        user.email,
        user.name || '',
        user.role,
        String(user.dailyEmailLimit),
        String(user.campaignsCount),
      ]
        .join(' ')
        .toLowerCase();

      if (userRoleFilter !== 'all' && roleValue !== userRoleFilter) return false;
      if (userStatusFilter === 'active' && !isActiveValue) return false;
      if (userStatusFilter === 'inactive' && isActiveValue) return false;
      if (query && !haystack.includes(query)) return false;
      return true;
    });
  }, [drafts, rows, userQuery, userRoleFilter, userStatusFilter]);
  const visibleAlerts = useMemo(() => {
    const alerts = summary?.systemAlerts || [];
    return alerts.filter((alert) => {
      if (dismissedAlertKeys.includes(alert.key)) return false;
      if (alertFilter === 'all') return true;
      return alert.level === alertFilter;
    });
  }, [summary, dismissedAlertKeys, alertFilter]);
  const compliance = useMemo<
    Array<{
      key: string;
      title: string;
      detail: string;
      status: ComplianceStatus;
      action: { label: string; href: string };
    }>
  >(
    () => [
      ...(settings
        ? buildComplianceItems({
            provider: settings.provider,
            awsFromEmail: settings.awsFromEmail,
            resendFromEmail: settings.resendFromEmail,
            hasWebhookSharedSecret: settings.hasWebhookSharedSecret,
            sendingDomain: settings.sendingDomain,
            spfVerified: settings.spfVerified,
            dkimVerified: settings.dkimVerified,
            dmarcVerified: settings.dmarcVerified,
            suppressedContacts: summary?.totals.suppressedContacts ?? 0,
          }).map((item) => ({
            ...item,
            action: item.action ?? { label: 'Settings', href: `${APP_ROUTES.DASHBOARD}/settings` },
          }))
        : []),
    ],
    [settings, summary],
  );

  return (
    <div className="overview">
      <section className="card admin-hero" style={{ marginBottom: '1rem' }}>
        <div className="admin-hero__content">
          <div>
            <p className="admin-eyebrow">Operator Console</p>
            <h1>Admin</h1>
            <p>Manage access, daily sending limits, compliance signals, and live platform health from a single control surface.</p>
          </div>
          <div className="admin-hero__actions">
            <Link className="btn-secondary" href={`${APP_ROUTES.ADMIN_DASHBOARD}/agents`}>AI Settings</Link>
            <Link className="btn-secondary" href={`${APP_ROUTES.DASHBOARD}/help`}>Help</Link>
            <button className="btn-primary" type="button" onClick={load}>
              Refresh
            </button>
          </div>
        </div>
        <div className="admin-hero__meta">
          <span className="badge badge-info">Viewer: {summary?.viewer.email || 'loading'}</span>
          <span className="badge badge-success">{summary?.totals.activeUsers ?? 0} active users</span>
          <span className="badge badge-warning">{summary?.systemHealth.queue.queued ?? 0} queued jobs</span>
          <span className="badge">{summary?.systemHealth.recentErrors24h ?? 0} errors in 24h</span>
        </div>
      </section>
      <div className="stats-grid dashboard-stats">
        <div className="stat-card"><h3>Users</h3><p className="stat-value">{summary?.totals.users ?? 0}</p></div>
        <div className="stat-card"><h3>Active Users</h3><p className="stat-value">{summary?.totals.activeUsers ?? 0}</p></div>
        <div className="stat-card"><h3>Campaigns</h3><p className="stat-value">{summary?.totals.campaigns ?? 0}</p></div>
        <div className="stat-card"><h3>Today Sent</h3><p className="stat-value">{summary?.totals.sentToday ?? 0}</p></div>
        <div className="stat-card"><h3>Opened</h3><p className="stat-value">{summary?.totals.openTotal ?? 0}</p></div>
        <div className="stat-card"><h3>Bounced</h3><p className="stat-value text-red">{summary?.totals.bounceTotal ?? 0}</p></div>
      </div>

      <div className="admin-panels" style={{ marginBottom: '1rem' }}>
        <div className="card dashboard-panel admin-panel-card">
          <div className="help-panel__header">
            <div>
              <h2>Compliance snapshot</h2>
              <p className="form-note">A short operator view of the send-safety basics. Help has the full walkthrough.</p>
            </div>
            <Link className="mini-btn" href={`${APP_ROUTES.DASHBOARD}/help`}>Open Help</Link>
          </div>
          <div className="admin-compliance-grid">
            {compliance.map((item) => (
              <article className="admin-compliance-card" key={item.title}>
                <div className="help-compliance-card__head">
                  <span className={`badge ${statusClass(item.status)}`}>{statusLabel(item.status)}</span>
                  <h3>{item.title}</h3>
                </div>
                <p>{item.detail}</p>
                <Link className="mini-btn" href={item.action.href}>
                  {item.action.label}
                </Link>
              </article>
            ))}
          </div>
        </div>

        <div className="card dashboard-panel admin-panel-card">
          <div className="help-panel__header">
            <div>
              <h2>Recent audit trail</h2>
              <p className="form-note">Recent access, settings, campaign, list, team, and agent actions from across the platform.</p>
            </div>
            <Link className="mini-btn" href={`${APP_ROUTES.DASHBOARD}/help`}>Help</Link>
          </div>
          <div className="audit-trail-list">
            {(summary?.recentAudits || []).length === 0 ? (
              <p className="form-note">No audit events yet.</p>
            ) : (
              (summary?.recentAudits || []).map((event) => (
                <article className="audit-trail-item" key={event.id}>
                  <div className="audit-trail-item__top">
                    <strong>{event.action}</strong>
                    <span className="badge">{event.scopeType}</span>
                  </div>
                  <div className="audit-trail-item__meta">
                    <span>{event.actorEmail}</span>
                    <span>{event.actorRole}</span>
                    <span>{event.entityType}</span>
                    <span>{event.createdAt ? new Date(event.createdAt).toLocaleString() : '-'}</span>
                  </div>
                  <p className="form-note">
                    {event.entityId ? `Entity ${event.entityId}` : 'No entity id'}
                    {event.metadata ? ` · ${JSON.stringify(event.metadata)}` : ''}
                  </p>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="card dashboard-panel admin-panel-card">
          <div className="help-panel__header">
            <div>
              <h2>System health</h2>
              <p className="form-note">Queue pressure, live runtime metrics, and the latest error signals from the app.</p>
            </div>
          </div>
          {(summary?.systemAlerts || []).length > 0 ? (
            <>
              <div className="alert-toolbar">
                <div className="alert-filter-chips" role="tablist" aria-label="System alert filters">
                  {(['all', 'critical', 'warning', 'info'] as const).map((level) => {
                    const active = alertFilter === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        className={`mini-btn ${active ? 'mini-btn--active' : ''}`}
                        onClick={() => setAlertFilter(level)}
                      >
                        {level === 'all' ? 'All' : level.charAt(0).toUpperCase() + level.slice(1)}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => setDismissedAlertKeys([])}
                  disabled={dismissedAlertKeys.length === 0}
                >
                  Reset dismissed
                </button>
              </div>
              <div className="system-alerts-grid" style={{ marginBottom: '1rem' }}>
                {visibleAlerts.length > 0 ? (
                  visibleAlerts.map((alert) => (
                    <article className={`system-alert-card system-alert-card--${alert.level}`} key={alert.key}>
                      <div className="help-compliance-card__head">
                        <div className="alert-card__head-row">
                          <span className={`badge ${alertClass(alert.level)}`}>
                            {alert.level === 'critical' ? 'Critical' : alert.level === 'warning' ? 'Warning' : 'Info'}
                          </span>
                          <button
                            type="button"
                            className="mini-btn"
                            onClick={() =>
                              setDismissedAlertKeys((current) =>
                                current.includes(alert.key) ? current : [...current, alert.key],
                              )
                            }
                          >
                            Dismiss
                          </button>
                        </div>
                        <h3>{alert.title}</h3>
                      </div>
                      <p>{alert.detail}</p>
                      {alert.action ? (
                        <Link className="mini-btn" href={alert.action.href}>
                          {alert.action.label}
                        </Link>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <div className="system-alert-empty">
                    <p className="form-note">No visible alerts for this filter. Dismissed alerts stay hidden for this admin session until you reset them.</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="form-note" style={{ marginBottom: '1rem' }}>No active system alerts. The platform is below the current warning thresholds.</p>
          )}
          <div className="stats-grid dashboard-stats">
            <div className="stat-card"><h3>Queued</h3><p className="stat-value">{summary?.systemHealth.queue.queued ?? 0}</p></div>
            <div className="stat-card"><h3>Running</h3><p className="stat-value">{summary?.systemHealth.queue.running ?? 0}</p></div>
            <div className="stat-card"><h3>Retrying</h3><p className="stat-value">{summary?.systemHealth.queue.retrying ?? 0}</p></div>
            <div className="stat-card"><h3>Failed</h3><p className="stat-value text-red">{summary?.systemHealth.queue.failed ?? 0}</p></div>
            <div className="stat-card"><h3>Errors 24h</h3><p className="stat-value text-red">{summary?.systemHealth.recentErrors24h ?? 0}</p></div>
            <div className="stat-card"><h3>Warnings 24h</h3><p className="stat-value text-yellow">{summary?.systemHealth.recentWarnings24h ?? 0}</p></div>
            <div className="stat-card"><h3>Memory RSS</h3><p className="stat-value">{summary?.systemHealth.live ? `${summary.systemHealth.live.memoryRssMb.toFixed(1)} MB` : '0 MB'}</p></div>
            <div className="stat-card"><h3>Event Loop</h3><p className="stat-value">{summary?.systemHealth.live ? `${summary.systemHealth.live.eventLoopUtilization.toFixed(2)}%` : '0%'}</p></div>
          </div>
          <div className="audit-trail-list" style={{ marginTop: '1rem' }}>
            {summary?.systemHealth.lastError ? (
              <article className="audit-trail-item">
                <div className="audit-trail-item__top">
                  <strong>Latest error</strong>
                  <span className="badge badge-warning">{summary.systemHealth.lastError.source}</span>
                </div>
                <div className="audit-trail-item__meta">
                  <span>{summary.systemHealth.lastError.createdAt ? new Date(summary.systemHealth.lastError.createdAt).toLocaleString() : '-'}</span>
                </div>
                <p className="form-note">{summary.systemHealth.lastError.message}</p>
              </article>
            ) : (
              <p className="form-note">No error events recorded yet.</p>
            )}
            {(summary?.recentSystemEvents || []).length === 0
              ? null
              : (summary?.recentSystemEvents || []).map((event) => (
                  <article className="audit-trail-item" key={event.id}>
                    <div className="audit-trail-item__top">
                      <strong>{event.source}</strong>
                      <span className={`badge ${event.level === 'ERROR' ? 'badge-warning' : event.level === 'WARN' ? 'badge-info' : ''}`}>{event.level}</span>
                    </div>
                    <div className="audit-trail-item__meta">
                      <span>{event.createdAt ? new Date(event.createdAt).toLocaleString() : '-'}</span>
                      {event.campaignId ? <span>Campaign {event.campaignId}</span> : null}
                      {event.userId ? <span>User {event.userId}</span> : null}
                    </div>
                    <p className="form-note">{event.message}</p>
                  </article>
                ))}
          </div>
        </div>
      </div>

      <section className="card dashboard-panel admin-section" style={{ marginBottom: '1rem' }}>
        <div className="admin-section__header">
          <div>
            <p className="admin-eyebrow">Access Management</p>
            <h2>Create User Access</h2>
            <p className="form-note">Provision a user before they can log in with Google. Managers and admins can be assigned here too.</p>
          </div>
        </div>
        <form className="admin-form-grid" onSubmit={createUser}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required />
          <select className="status-select" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="USER">USER</option>
            <option value="MANAGER">MANAGER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <input value={dailyEmailLimit} onChange={(e) => setDailyEmailLimit(e.target.value)} type="number" min={1} step={1} />
          <input
            value={imageUploadLimitKb}
            onChange={(e) => setImageUploadLimitKb(e.target.value)}
            type="number"
            min={1}
            step={1}
            placeholder="Upload limit KB (blank uses global)"
          />
          <button className="btn-primary" type="submit">Create User</button>
        </form>
      </section>

      <section className="card dashboard-panel admin-section">
        <div className="admin-section__header">
            <div>
              <p className="admin-eyebrow">People</p>
              <h2>User Directory</h2>
              <p className="form-note">Search, filter, edit access controls inline, or jump into a user session to inspect their view. A return banner will stay available in the shell.</p>
            </div>
          <div className="admin-directory-toolbar">
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Search users, emails, campaigns..."
            />
            <select className="status-select" value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value as typeof userRoleFilter)}>
              <option value="all">All roles</option>
              <option value="ADMIN">ADMIN</option>
              <option value="MANAGER">MANAGER</option>
              <option value="USER">USER</option>
            </select>
            <select className="status-select" value={userStatusFilter} onChange={(e) => setUserStatusFilter(e.target.value as typeof userStatusFilter)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <p className="form-note" style={{ marginBottom: '0.75rem' }}>
          Showing {filteredRows.length} of {rows.length} users.
        </p>
        <div className="table-wrap">
          <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Access</th>
              <th>Usage</th>
              <th>Content</th>
              <th>Stats</th>
              <th>Session</th>
              <th>Save</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr><td colSpan={7}>No users yet.</td></tr>
            ) : filteredRows.map((user) => {
              const draft = drafts[user.id] || {};
              return (
                <tr key={user.id}>
                  <td>
                    <strong>{user.email}</strong>
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{user.name || '-'}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{user.lastLoginAt ? `Last login ${new Date(user.lastLoginAt).toLocaleString()}` : 'Never logged in'}</div>
                  </td>
                  <td style={{ minWidth: '220px' }}>
                    <select className="status-select" value={String(draft.role || user.role)} onChange={(e) => updateDraft(user.id, 'role', e.target.value)}>
                      <option value="USER">USER</option>
                      <option value="MANAGER">MANAGER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', color: '#475569' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(draft.isActive ?? user.isActive)}
                        onChange={(e) => updateDraft(user.id, 'isActive', e.target.checked)}
                      />
                      Active
                    </label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={String(draft.dailyEmailLimit ?? user.dailyEmailLimit)}
                        onChange={(e) => updateDraft(user.id, 'dailyEmailLimit', Number(e.target.value))}
                        style={{ marginTop: '0.5rem' }}
                      />
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={draft.imageUploadLimitKb === null ? '' : String(draft.imageUploadLimitKb ?? user.imageUploadLimitKb ?? '')}
                        onChange={(e) => updateDraft(user.id, 'imageUploadLimitKb', e.target.value ? Number(e.target.value) : null)}
                        placeholder="Global default"
                        style={{ marginTop: '0.5rem' }}
                      />
                    </td>
                    <td style={{ minWidth: '220px' }}>
                    <div className="progress-track" aria-hidden="true">
                      <div className="progress-bar" style={{ width: `${percent(user.sentToday, user.dailyEmailLimit)}%` }} />
                    </div>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#64748b' }}>
                      {user.sentToday}/{user.dailyEmailLimit} sent today, {user.remainingToday} remaining
                    </div>
                  </td>
                  <td style={{ fontSize: '0.85rem', color: '#475569' }}>
                    {user.listsCount} lists
                    <br />
                    {user.templatesCount} templates
                    <br />
                    {user.campaignsCount} campaigns
                    <br />
                    {user.imageUploadLimitKb ? `${user.imageUploadLimitKb} KB upload limit` : 'Global upload limit'}
                  </td>
                  <td style={{ fontSize: '0.85rem', color: '#475569' }}>
                    {user.sentTotal} sent total
                    <br />
                    {user.contactCount} contacts
                    <br />
                    {user.openRate.toFixed(2)}% open rate
                    <br />
                    {user.bounceRate.toFixed(2)}% bounce rate
                    <br />
                    {user.unsubscribeRate.toFixed(2)}% unsubscribe rate
                  </td>
                  <td>
                    {summary?.viewer.userId === user.id ? (
                      <span className="badge badge-info">Current</span>
                    ) : (
                      <form className="admin-session-form" action={API_ROUTES.ADMIN_IMPERSONATION_START} method="post">
                        <input type="hidden" name="targetUserId" value={user.id} />
                        <input type="hidden" name="next" value={APP_ROUTES.DASHBOARD} />
                        <input type="hidden" name="returnTo" value={APP_ROUTES.ADMIN_DASHBOARD} />
                        <button className="mini-btn" type="submit">
                          Switch
                        </button>
                      </form>
                    )}
                  </td>
                  <td>
                    <button className="mini-btn" type="button" onClick={() => saveUser(user.id)} disabled={savingId === user.id}>
                      {savingId === user.id ? 'Saving...' : 'Save'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
