'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  dailyEmailLimit: number;
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
  totals: {
    users: number;
    activeUsers: number;
    campaigns: number;
    lists: number;
    contacts: number;
    sentToday: number;
    openTotal: number;
    bounceTotal: number;
    unsubscribeTotal: number;
  };
  users: UserRow[];
};

function percent(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, (part / total) * 100);
}

export default function AdminDashboardClient() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('USER');
  const [dailyEmailLimit, setDailyEmailLimit] = useState('100000');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<UserRow>>>({});

  async function load() {
    const response = await fetch('/api/admin/overview', { cache: 'no-store' });
    const data = (await response.json()) as SummaryResponse;
    setSummary(data);

    const nextDrafts: Record<string, Partial<UserRow>> = {};
    for (const user of data.users || []) {
      nextDrafts[user.id] = {
        name: user.name || '',
        role: user.role,
        isActive: user.isActive,
        dailyEmailLimit: user.dailyEmailLimit,
      };
    }
    setDrafts(nextDrafts);
  }

  useEffect(() => {
    load();
  }, []);

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
      }),
    });

    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Failed to create user.');

    setMessage(`User created: ${data.user.email}`);
    setName('');
    setEmail('');
    setRole('USER');
    setDailyEmailLimit('100000');
    await load();
  }

  function updateDraft(id: string, field: string, value: string | boolean | number) {
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
        }),
      });

    const data = await response.json();
    setSavingId(null);
    if (!response.ok) return setMessage(data.error || 'Failed to update user.');

    setMessage(`Updated ${data.user.email}`);
    await load();
  }

  const rows = useMemo(() => summary?.users || [], [summary]);

  return (
    <div className="overview">
      <header className="page-header">
        <h1>Admin</h1>
        <p>Manage access, daily sending limits, and platform activity.</p>
      </header>

      {message ? <p className="form-note">{message}</p> : null}

      <div className="stats-grid">
        <div className="stat-card"><h3>Users</h3><p className="stat-value">{summary?.totals.users ?? 0}</p></div>
        <div className="stat-card"><h3>Active Users</h3><p className="stat-value">{summary?.totals.activeUsers ?? 0}</p></div>
        <div className="stat-card"><h3>Campaigns</h3><p className="stat-value">{summary?.totals.campaigns ?? 0}</p></div>
        <div className="stat-card"><h3>Today Sent</h3><p className="stat-value">{summary?.totals.sentToday ?? 0}</p></div>
        <div className="stat-card"><h3>Opened</h3><p className="stat-value">{summary?.totals.openTotal ?? 0}</p></div>
        <div className="stat-card"><h3>Bounced</h3><p className="stat-value text-red">{summary?.totals.bounceTotal ?? 0}</p></div>
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2>Create User Access</h2>
        <form className="auth-form" onSubmit={createUser}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required />
          <select className="status-select" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <input value={dailyEmailLimit} onChange={(e) => setDailyEmailLimit(e.target.value)} type="number" min={1} step={1} />
          <button className="btn-primary" type="submit">Create User</button>
        </form>
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Access</th>
              <th>Usage</th>
              <th>Content</th>
              <th>Stats</th>
              <th>Save</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6}>No users yet.</td></tr>
            ) : rows.map((user) => {
              const draft = drafts[user.id] || {};
              return (
                <tr key={user.id}>
                  <td>
                    <strong>{user.email}</strong>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{user.name || '-'}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{user.lastLoginAt ? `Last login ${new Date(user.lastLoginAt).toLocaleString()}` : 'Never logged in'}</div>
                  </td>
                  <td style={{ minWidth: '220px' }}>
                    <select className="status-select" value={String(draft.role || user.role)} onChange={(e) => updateDraft(user.id, 'role', e.target.value)}>
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', color: '#cbd5e1' }}>
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
                  </td>
                  <td style={{ minWidth: '220px' }}>
                    <div className="progress-track" aria-hidden="true">
                      <div className="progress-bar" style={{ width: `${percent(user.sentToday, user.dailyEmailLimit)}%` }} />
                    </div>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#94a3b8' }}>
                      {user.sentToday}/{user.dailyEmailLimit} sent today, {user.remainingToday} remaining
                    </div>
                  </td>
                  <td style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                    {user.listsCount} lists
                    <br />
                    {user.templatesCount} templates
                    <br />
                    {user.campaignsCount} campaigns
                  </td>
                  <td style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
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
    </div>
  );
}
