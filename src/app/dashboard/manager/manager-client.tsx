'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/toast-provider';

type TeamMember = {
  memberId: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  dailyEmailLimit: number;
  lastLoginAt: string | null;
  createdAt: string;
  allocatedDailyLimit: number;
};

type Campaign = {
  campaignId: string;
  campaignName: string;
  subject: string;
  status: string;
  provider: string | null;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationSeconds: number | null;
  ownerEmail: string;
};

type Team = {
  id: string;
  name: string;
  description: string | null;
  dailyCreditLimit: number;
  managerId: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  allocatedCredits: number;
  remainingCredits: number;
  sentToday: number;
  sentTotal: number;
  openTotal: number;
  bounceTotal: number;
  unsubscribeTotal: number;
  openRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  members: TeamMember[];
  recentCampaigns: Campaign[];
};

type ManagerOverview = {
  totals: {
    teams: number;
    members: number;
    dailyCredits: number;
    allocatedCredits: number;
    sentToday: number;
    sentTotal: number;
    openTotal: number;
    bounceTotal: number;
    unsubscribeTotal: number;
    openRate: number;
    bounceRate: number;
    unsubscribeRate: number;
  };
  teams: Team[];
  selectedTeamId: string | null;
};

function formatDuration(seconds: number | null) {
  if (seconds == null) return '-';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

export default function ManagerDashboardClient() {
  const toast = useToast();
  const [overview, setOverview] = useState<ManagerOverview | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [savingTeamId, setSavingTeamId] = useState<string | null>(null);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [teamDrafts, setTeamDrafts] = useState<Record<string, { name: string; description: string; dailyCreditLimit: string }>>({});
  const [memberDrafts, setMemberDrafts] = useState<Record<string, { name: string; isActive: boolean; dailyEmailLimit: string }>>({});
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [teamDailyCreditLimit, setTeamDailyCreditLimit] = useState('100000');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberName, setMemberName] = useState('');
  const [memberDailyLimit, setMemberDailyLimit] = useState('100000');

  const load = async () => {
    const res = await fetch('/api/manager/overview', { cache: 'no-store' });
    const data = (await res.json()) as { teams?: Team[]; totals?: ManagerOverview['totals']; selectedTeamId?: string | null; error?: string };
    if (!res.ok) {
      toast.error('Manager dashboard failed', data.error || 'The manager dashboard could not be loaded.');
      return;
    }

    const nextOverview: ManagerOverview = {
      totals: data.totals || {
        teams: 0,
        members: 0,
        dailyCredits: 0,
        allocatedCredits: 0,
        sentToday: 0,
        sentTotal: 0,
        openTotal: 0,
        bounceTotal: 0,
        unsubscribeTotal: 0,
        openRate: 0,
        bounceRate: 0,
        unsubscribeRate: 0,
      },
      teams: data.teams || [],
      selectedTeamId: data.selectedTeamId || null,
    };

    setOverview(nextOverview);
    const nextSelected = selectedTeamId || nextOverview.selectedTeamId || nextOverview.teams[0]?.id || '';
    setSelectedTeamId(nextSelected);

    const nextTeamDrafts: Record<string, { name: string; description: string; dailyCreditLimit: string }> = {};
    const nextMemberDrafts: Record<string, { name: string; isActive: boolean; dailyEmailLimit: string }> = {};
    for (const team of nextOverview.teams) {
      nextTeamDrafts[team.id] = {
        name: team.name,
        description: team.description || '',
        dailyCreditLimit: String(team.dailyCreditLimit),
      };
      for (const member of team.members) {
        nextMemberDrafts[member.memberId] = {
          name: member.name || '',
          isActive: member.isActive,
          dailyEmailLimit: String(member.dailyEmailLimit),
        };
      }
    }

    setTeamDrafts(nextTeamDrafts);
    setMemberDrafts(nextMemberDrafts);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTeam = useMemo(
    () => overview?.teams.find((team) => team.id === selectedTeamId) || overview?.teams[0] || null,
    [overview, selectedTeamId],
  );

  async function createTeam(event: FormEvent) {
    event.preventDefault();
    setCreatingTeam(true);

    const res = await fetch('/api/manager/teams', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: teamName,
        description: teamDescription,
        dailyCreditLimit: Number(teamDailyCreditLimit),
      }),
    });

    const data = (await res.json()) as { error?: string; team?: Team };
    setCreatingTeam(false);
    if (!res.ok) {
      toast.error('Team creation failed', data.error || 'The team could not be created.');
      return;
    }

    setTeamName('');
    setTeamDescription('');
    setTeamDailyCreditLimit('100000');
    toast.success('Team created', 'The new team is ready.');
    await load();
    if (data.team?.id) setSelectedTeamId(data.team.id);
  }

  async function saveTeam(teamId: string) {
    const draft = teamDrafts[teamId];
    if (!draft) return;
    setSavingTeamId(teamId);

    const res = await fetch(`/api/manager/teams/${teamId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: draft.name,
        description: draft.description,
        dailyCreditLimit: Number(draft.dailyCreditLimit),
      }),
    });

    const data = (await res.json()) as { error?: string; team?: Team };
    setSavingTeamId(null);
    if (!res.ok) {
      toast.error('Team save failed', data.error || 'The team could not be updated.');
      return;
    }

    toast.success('Team updated', 'The team changes were saved.');
    await load();
  }

  async function deleteTeam(teamId: string) {
    if (!confirm('Delete this team? Members will be detached and their limits reset.')) return;

    const res = await fetch(`/api/manager/teams/${teamId}`, { method: 'DELETE' });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error('Team delete failed', data.error || 'The team could not be deleted.');
      return;
    }

    toast.success('Team deleted', 'The team was removed.');
    await load();
    if (selectedTeamId === teamId) setSelectedTeamId('');
  }

  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (!selectedTeam) return;
    setAddingMember(true);

    const res = await fetch(`/api/manager/teams/${selectedTeam.id}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: memberEmail,
        name: memberName,
        dailyEmailLimit: Number(memberDailyLimit),
      }),
    });

    const data = (await res.json()) as { error?: string };
    setAddingMember(false);
    if (!res.ok) {
      toast.error('Member add failed', data.error || 'The team member could not be added.');
      return;
    }

    setMemberEmail('');
    setMemberName('');
    setMemberDailyLimit('100000');
    toast.success('Team member added', 'The member was added to the team.');
    await load();
  }

  async function saveMember(teamId: string, memberId: string) {
    const draft = memberDrafts[memberId];
    if (!draft) return;
    setSavingMemberId(memberId);

    const res = await fetch(`/api/manager/teams/${teamId}/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: draft.name,
        isActive: draft.isActive,
        dailyEmailLimit: Number(draft.dailyEmailLimit),
      }),
    });

    const data = (await res.json()) as { error?: string };
    setSavingMemberId(null);
    if (!res.ok) {
      toast.error('Member update failed', data.error || 'The team member could not be updated.');
      return;
    }

    toast.success('Member updated', 'The team member changes were saved.');
    await load();
  }

  async function deleteMember(teamId: string, memberId: string) {
    if (!confirm('Remove this member from the team? Their sending limit will reset.')) return;

    const res = await fetch(`/api/manager/teams/${teamId}/members/${memberId}`, { method: 'DELETE' });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error('Member removal failed', data.error || 'The team member could not be removed.');
      return;
    }

    toast.success('Member removed', 'The member was removed from the team.');
    await load();
  }

  return (
    <div className="overview">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h1>Manager Dashboard</h1>
            <p>Create teams, assign email credits to members, and watch team activity in one place.</p>
          </div>
          <div className="header-actions">
            <Link className="btn-secondary" href="/dashboard/resources">Resources</Link>
            <Link className="btn-secondary" href="/dashboard/help">Help</Link>
          </div>
        </div>
      </header>
      <div className="stats-grid dashboard-stats">
        <div className="stat-card"><h3>Teams</h3><p className="stat-value">{overview?.totals.teams ?? 0}</p></div>
        <div className="stat-card"><h3>Members</h3><p className="stat-value">{overview?.totals.members ?? 0}</p></div>
        <div className="stat-card"><h3>Allocated Credits</h3><p className="stat-value">{overview?.totals.allocatedCredits ?? 0}</p></div>
        <div className="stat-card"><h3>Today Sent</h3><p className="stat-value">{overview?.totals.sentToday ?? 0}</p></div>
        <div className="stat-card"><h3>Bounced</h3><p className="stat-value text-red">{overview?.totals.bounceTotal ?? 0}</p></div>
        <div className="stat-card"><h3>Unsubscribed</h3><p className="stat-value text-yellow">{overview?.totals.unsubscribeTotal ?? 0}</p></div>
      </div>

      <div className="card dashboard-panel" style={{ marginBottom: '1rem' }}>
        <h2>Create Team</h2>
        <p className="form-note">Give each team a daily credit pool, then distribute members under that cap.</p>
        <form className="auth-form" onSubmit={createTeam}>
          <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team name" required />
          <input value={teamDescription} onChange={(e) => setTeamDescription(e.target.value)} placeholder="Description" />
          <input
            value={teamDailyCreditLimit}
            onChange={(e) => setTeamDailyCreditLimit(e.target.value)}
            type="number"
            min={1}
            step={1}
            placeholder="Team credit limit"
            required
          />
          <button className="btn-primary" type="submit" disabled={creatingTeam}>
            {creatingTeam ? 'Creating...' : 'Create Team'}
          </button>
        </form>
      </div>

      <div className="manager-workspace">
        <section className="card manager-teams">
          <div className="section-header">
            <div>
              <h2>Your Teams</h2>
              <p>Select a team to manage members and see activity.</p>
            </div>
          </div>

          <div className="manager-team-list">
            {overview?.teams.length ? overview.teams.map((team) => (
              <button
                key={team.id}
                type="button"
                className={`manager-team-item ${selectedTeam?.id === team.id ? 'is-selected-row' : ''}`}
                onClick={() => setSelectedTeamId(team.id)}
              >
                <strong>{team.name}</strong>
                <span>{team.memberCount} members</span>
                <span>{team.allocatedCredits}/{team.dailyCreditLimit} credits allocated</span>
              </button>
            )) : (
              <div className="detail-empty">
                <h2>No teams yet.</h2>
                <p>Create your first team above to start assigning users and credits.</p>
              </div>
            )}
          </div>
        </section>

        <section className="card manager-detail">
          {selectedTeam ? (
            <>
              <header className="section-header">
                <div>
                  <h2>{selectedTeam.name}</h2>
                  <p>{selectedTeam.description || 'No description yet.'}</p>
                </div>
                <div className="detail-actions">
                  <button className="mini-btn danger" type="button" onClick={() => deleteTeam(selectedTeam.id)}>Delete Team</button>
                  <button className="mini-btn" type="button" onClick={() => saveTeam(selectedTeam.id)} disabled={savingTeamId === selectedTeam.id}>
                    {savingTeamId === selectedTeam.id ? 'Saving...' : 'Save Team'}
                  </button>
                </div>
              </header>

              <div className="detail-stats">
                <div><span>Credit Pool</span><strong>{selectedTeam.dailyCreditLimit}</strong></div>
                <div><span>Allocated</span><strong>{selectedTeam.allocatedCredits}</strong></div>
                <div><span>Remaining</span><strong>{selectedTeam.remainingCredits}</strong></div>
                <div><span>Sent Today</span><strong>{selectedTeam.sentToday}</strong></div>
              </div>

              <div className="card dashboard-panel" style={{ marginBottom: '1rem' }}>
                <h3>Edit Team</h3>
                <form className="auth-form" onSubmit={(event) => { event.preventDefault(); saveTeam(selectedTeam.id); }}>
                  <input
                    value={teamDrafts[selectedTeam.id]?.name ?? selectedTeam.name}
                    onChange={(e) => setTeamDrafts((current) => ({
                      ...current,
                      [selectedTeam.id]: {
                        name: e.target.value,
                        description: current[selectedTeam.id]?.description ?? selectedTeam.description ?? '',
                        dailyCreditLimit: current[selectedTeam.id]?.dailyCreditLimit ?? String(selectedTeam.dailyCreditLimit),
                      },
                    }))}
                    placeholder="Team name"
                    required
                  />
                  <input
                    value={teamDrafts[selectedTeam.id]?.description ?? selectedTeam.description ?? ''}
                    onChange={(e) => setTeamDrafts((current) => ({
                      ...current,
                      [selectedTeam.id]: {
                        name: current[selectedTeam.id]?.name ?? selectedTeam.name,
                        description: e.target.value,
                        dailyCreditLimit: current[selectedTeam.id]?.dailyCreditLimit ?? String(selectedTeam.dailyCreditLimit),
                      },
                    }))}
                    placeholder="Description"
                  />
                  <input
                    value={teamDrafts[selectedTeam.id]?.dailyCreditLimit ?? String(selectedTeam.dailyCreditLimit)}
                    onChange={(e) => setTeamDrafts((current) => ({
                      ...current,
                      [selectedTeam.id]: {
                        name: current[selectedTeam.id]?.name ?? selectedTeam.name,
                        description: current[selectedTeam.id]?.description ?? selectedTeam.description ?? '',
                        dailyCreditLimit: e.target.value,
                      },
                    }))}
                    type="number"
                    min={1}
                    step={1}
                  />
                  <button className="btn-primary" type="submit" disabled={savingTeamId === selectedTeam.id}>
                    {savingTeamId === selectedTeam.id ? 'Saving...' : 'Save Changes'}
                  </button>
                </form>
              </div>

              <div className="card dashboard-panel" style={{ marginBottom: '1rem' }}>
                <h3>Add Member</h3>
                <form className="auth-form" onSubmit={addMember}>
                  <input type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="User email" required />
                  <input value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="Name" />
                  <input
                    value={memberDailyLimit}
                    onChange={(e) => setMemberDailyLimit(e.target.value)}
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Allocated credits"
                    required
                  />
                  <button className="btn-primary" type="submit" disabled={addingMember}>
                    {addingMember ? 'Adding...' : 'Add Member'}
                  </button>
                </form>
              </div>

              <div className="detail-table-wrap manager-members-wrap">
                <h3 style={{ marginBottom: '0.75rem' }}>Members</h3>
                <table className="data-table manager-members-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Credit Allocation</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTeam.members.length === 0 ? (
                      <tr><td colSpan={4}>No members yet.</td></tr>
                    ) : selectedTeam.members.map((member) => {
                      const draft = memberDrafts[member.memberId] || { name: member.name || '', isActive: member.isActive, dailyEmailLimit: String(member.dailyEmailLimit) };
                      return (
                        <tr key={member.memberId}>
                          <td>
                            <strong>{member.email}</strong>
                            <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{member.name || '-'}</div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{member.lastLoginAt ? `Last login ${new Date(member.lastLoginAt).toLocaleString()}` : 'Never logged in'}</div>
                          </td>
                          <td style={{ minWidth: '220px' }}>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={draft.dailyEmailLimit}
                              onChange={(e) => setMemberDrafts((current) => ({
                                ...current,
                                [member.memberId]: { ...draft, dailyEmailLimit: e.target.value },
                              }))}
                            />
                            <div style={{ marginTop: '0.45rem', fontSize: '0.85rem', color: '#94a3b8' }}>
                              {member.allocatedDailyLimit} currently allocated
                            </div>
                          </td>
                          <td style={{ minWidth: '200px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', color: '#cbd5e1' }}>
                              <input
                                type="checkbox"
                                checked={Boolean(draft.isActive)}
                                onChange={(e) => setMemberDrafts((current) => ({
                                  ...current,
                                  [member.memberId]: { ...draft, isActive: e.target.checked },
                                }))}
                              />
                              Active
                            </label>
                            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#64748b' }}>
                              {member.role}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                              <button className="mini-btn" type="button" onClick={() => saveMember(selectedTeam.id, member.memberId)} disabled={savingMemberId === member.memberId}>
                                {savingMemberId === member.memberId ? 'Saving...' : 'Save'}
                              </button>
                              <button className="mini-btn danger" type="button" onClick={() => deleteMember(selectedTeam.id, member.memberId)}>
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="detail-table-wrap manager-activity-wrap">
                <h3 style={{ marginBottom: '0.75rem' }}>Recent Team Activity</h3>
                <table className="data-table manager-activity-table">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Owner</th>
                      <th>Status</th>
                      <th>Progress</th>
                      <th>Timing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTeam.recentCampaigns.length === 0 ? (
                      <tr><td colSpan={5}>No team activity yet.</td></tr>
                    ) : selectedTeam.recentCampaigns.map((campaign) => (
                      <tr key={campaign.campaignId}>
                        <td>
                          <strong>{campaign.campaignName}</strong>
                          <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{campaign.subject}</div>
                        </td>
                        <td>{campaign.ownerEmail}</td>
                        <td>{campaign.status}</td>
                        <td>
                          <div className="progress-track" aria-hidden="true">
                            <div className="progress-bar" style={{ width: `${campaign.sentCount > 0 ? 100 : 0}%` }} />
                          </div>
                          <div style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: '#94a3b8' }}>
                            {campaign.sentCount} sent, {campaign.failedCount} failed, {campaign.skippedCount} skipped
                          </div>
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem', color: '#cbd5e1' }}>
                          {campaign.startedAt ? `Started ${new Date(campaign.startedAt).toLocaleString()}` : '-'}
                          <br />
                          {campaign.finishedAt ? `Finished ${new Date(campaign.finishedAt).toLocaleString()}` : '-'}
                          <br />
                          Duration: {formatDuration(campaign.durationSeconds)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="detail-empty">
              <h2>No team selected</h2>
              <p>Create a team or pick one from the list on the left to manage members and activity.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
