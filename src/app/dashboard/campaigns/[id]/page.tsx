import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { buildOwnerScope } from '@/lib/data-scope';
import { queryRow, queryRows } from '@/lib/sqlite';
import { CampaignDetailActions } from './campaign-detail-actions';
import { APP_ROUTES } from '@/lib/routes';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return '-';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

export default async function CampaignDetailPage({ params }: Params) {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect(APP_ROUTES.LOGIN);

  const ownerScope = buildOwnerScope(user, 'c."userId"');
  const campaign = queryRow<{
    id: string;
    name: string;
    subject: string;
    bodyHtml: string;
    status: string;
    provider: string | null;
    isArchived: number | boolean;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    startedAt: string | null;
    finishedAt: string | null;
    durationSeconds: number | null;
    userId: string;
    listId: string;
    templateId: string | null;
    createdAt: string;
    updatedAt: string;
    listName: string;
    templateName: string | null;
    ownerEmail: string;
    ownerName: string | null;
    ownerRole: string;
  }>(
    `
      SELECT
        c.id,
        c.name,
        c.subject,
        c."bodyHtml",
        c.status,
        c.provider,
        CASE WHEN COALESCE(c."isArchived", FALSE) THEN 1 ELSE 0 END as "isArchived",
        c."totalRecipients",
        c."sentCount",
        c."failedCount",
        c."skippedCount",
        c."startedAt",
        c."finishedAt",
        c."durationSeconds",
        c."userId",
        c."listId",
        c."templateId",
        c."createdAt",
        c."updatedAt",
        l.name as listName,
        t.name as templateName,
        u.email as ownerEmail,
        u.name as ownerName,
        u.role as ownerRole
      FROM "Campaign" c
      INNER JOIN "List" l ON l.id = c."listId"
      LEFT JOIN "Template" t ON t.id = c."templateId"
      INNER JOIN "User" u ON u.id = c."userId"
      WHERE c.id = ? AND ${ownerScope.clause}
      LIMIT 1
    `,
    [params.id, ...ownerScope.params],
  );

  if (!campaign) redirect('/dashboard/campaigns');

  const selectedLists = queryRows<{ id: string; name: string; isDefaultTestList: number | boolean }>(
    `
      SELECT
        l.id,
        l.name,
        CASE WHEN COALESCE(l."isDefaultTestList", FALSE) THEN 1 ELSE 0 END as "isDefaultTestList"
      FROM "CampaignList" cl
      INNER JOIN "List" l ON l.id = cl."listId"
      WHERE cl."campaignId" = ?
      ORDER BY cl."createdAt" ASC
    `,
    [params.id],
  );

  const lastJob = queryRow<{
    id: string;
    status: string;
    provider: string | null;
    attempts: number;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    quotaSkippedCount: number;
    remainingToday: number;
    requestedAt: string;
    startedAt: string | null;
    nextRunAt: string | null;
    finishedAt: string | null;
    lastError: string | null;
    skipReason: string | null;
    updatedAt: string;
  }>(
    `
      SELECT
        id, status, provider, attempts, "totalRecipients", "sentCount", "failedCount", "skippedCount",
        "quotaSkippedCount", "remainingToday", "requestedAt", "startedAt", "nextRunAt", "finishedAt",
        "lastError", "skipReason", "updatedAt"
      FROM "CampaignSendJob"
      WHERE "campaignId" = ?
      ORDER BY "createdAt" DESC
      LIMIT 1
    `,
    [params.id],
  );

  const systemEvents = queryRows<{
    id: string;
    level: string;
    source: string;
    message: string;
    createdAt: string;
  }>(
    `
      SELECT id, level, source, message, "createdAt"
      FROM "SystemEvent"
      WHERE "campaignId" = ?
      ORDER BY "createdAt" DESC
      LIMIT 8
    `,
    [params.id],
  );

  const ownerName = campaign.ownerName || campaign.ownerEmail;
  const listNames = selectedLists.length > 0 ? selectedLists.map((list) => list.name).join(', ') : campaign.listName;
  const readOnlyBadge = campaign.status === 'SENT' ? 'Sent campaign' : campaign.status;

  return (
    <div className="overview campaign-detail-page">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h1 style={{ marginBottom: 0 }}>{campaign.name}</h1>
              <span className="badge badge-success">{readOnlyBadge}</span>
            </div>
            <p>Read-only sent campaign detail. Copy it to create a new draft.</p>
            <p className="campaign-detail-subject">Subject: {campaign.subject}</p>
          </div>
          <CampaignDetailActions campaignId={campaign.id} />
        </div>
      </header>

      <section className="card dashboard-panel campaign-detail-hero">
        <div className="campaign-detail-hero__top">
          <div className="campaign-detail-hero__copy">
            <p className="admin-eyebrow">Snapshot</p>
            <h2>At a glance</h2>
            <p>Locked for editing. Core delivery metadata stays in one place for a quick review.</p>
          </div>
          <div className="detail-actions campaign-detail-hero__actions">
            <span className="badge badge-success">Sent</span>
            <span className="badge badge-info">{campaign.provider || 'mock'}</span>
            {campaign.isArchived ? <span className="badge badge-warning">Archived</span> : null}
          </div>
        </div>

        <div className="campaign-detail-meta">
          <div>
            <span>Owner</span>
            <strong>{ownerName} ({campaign.ownerRole})</strong>
          </div>
          <div>
            <span>Lists</span>
            <strong>{listNames}</strong>
          </div>
          <div>
            <span>Template</span>
            <strong>{campaign.templateName || 'No template'}</strong>
          </div>
          <div>
            <span>Duration</span>
            <strong>{formatDuration(campaign.durationSeconds)}</strong>
          </div>
        </div>
      </section>

      <div className="stats-grid">
        <div className="stat-card"><h3>Sent</h3><p className="stat-value">{campaign.sentCount}</p></div>
        <div className="stat-card"><h3>Failed</h3><p className="stat-value text-red">{campaign.failedCount}</p></div>
        <div className="stat-card"><h3>Skipped</h3><p className="stat-value text-yellow">{campaign.skippedCount}</p></div>
        <div className="stat-card"><h3>Recipients</h3><p className="stat-value">{campaign.totalRecipients}</p></div>
      </div>

      <div className="cards-grid campaign-detail-grid">
        <section className="card dashboard-panel campaign-detail-panel campaign-detail-panel--tight">
          <div className="section-header section-header--compact">
            <div>
              <p className="admin-eyebrow">Campaign Details</p>
              <h2>Summary</h2>
            </div>
          </div>
          <div className="detail-stats campaign-detail-summary">
            <div><span>Status</span><strong>{campaign.status}</strong></div>
            <div><span>Provider</span><strong>{campaign.provider || 'mock'}</strong></div>
            <div><span>Created</span><strong>{formatDate(campaign.createdAt)}</strong></div>
            <div><span>Updated</span><strong>{formatDate(campaign.updatedAt)}</strong></div>
            <div><span>Started</span><strong>{formatDate(campaign.startedAt)}</strong></div>
            <div><span>Finished</span><strong>{formatDate(campaign.finishedAt)}</strong></div>
          </div>
        </section>

        <section className="card dashboard-panel campaign-detail-panel campaign-detail-panel--tight">
          <div className="section-header section-header--compact">
            <div>
              <p className="admin-eyebrow">Latest Job</p>
              <h2>Send state</h2>
            </div>
          </div>
          {lastJob ? (
            <div className="detail-stats campaign-detail-summary">
              <div><span>Status</span><strong>{lastJob.status}</strong></div>
              <div><span>Provider</span><strong>{lastJob.provider || 'mock'}</strong></div>
              <div><span>Attempts</span><strong>{lastJob.attempts}</strong></div>
              <div><span>Requested</span><strong>{formatDate(lastJob.requestedAt)}</strong></div>
              <div><span>Started</span><strong>{formatDate(lastJob.startedAt)}</strong></div>
              <div><span>Finished</span><strong>{formatDate(lastJob.finishedAt)}</strong></div>
              <div><span>Skip reason</span><strong>{lastJob.skipReason || '-'}</strong></div>
              <div><span>Last error</span><strong>{lastJob.lastError || '-'}</strong></div>
            </div>
          ) : (
            <p className="form-note">No send job was recorded for this campaign.</p>
          )}
        </section>
      </div>

      <section className="card dashboard-panel campaign-detail-panel campaign-detail-preview">
        <div className="section-header section-header--compact">
          <div>
            <p className="admin-eyebrow">Content</p>
            <h2>Email body preview</h2>
          </div>
        </div>
        <p className="form-note campaign-detail-preview__note">
          This preview is rendered from the sent HTML so it stays visually faithful to the original campaign.
        </p>
        <div className="campaign-detail-preview__frame">
          <div className="campaign-detail-preview__chrome" aria-hidden="true">
            <div className="campaign-detail-preview__chrome-dots">
              <span />
              <span />
              <span />
            </div>
            <div className="campaign-detail-preview__chrome-title">
              <span>{campaign.subject || campaign.name}</span>
              <span>{campaign.provider || 'mock'} · sent preview</span>
            </div>
            <div className="campaign-detail-preview__chrome-url">campaign-preview.local/{campaign.id.slice(0, 8)}</div>
          </div>
          <div className="campaign-detail-preview__viewport">
            <iframe
              title={`${campaign.name} preview`}
              srcDoc={campaign.bodyHtml}
              sandbox=""
              style={{ width: '100%', minHeight: '620px', border: 0, background: '#fff' }}
            />
          </div>
        </div>
      </section>

      <section className="card dashboard-panel campaign-detail-panel campaign-detail-panel--tight campaign-detail-timeline">
        <div className="section-header section-header--compact">
          <div>
            <p className="admin-eyebrow">Activity</p>
            <h2>Recent system events</h2>
          </div>
        </div>
        <div className="campaigns-live-timeline">
          {systemEvents.length > 0 ? systemEvents.map((event) => (
            <div key={event.id} className="campaigns-live-timeline__item">
              <div className="campaigns-live-timeline__time">{formatDate(event.createdAt)}</div>
              <div className="campaigns-live-timeline__body">
                <strong>{event.level} · {event.source}</strong>
                <span>{event.message}</span>
              </div>
            </div>
          )) : (
            <div className="campaigns-live-timeline__item">
              <div className="campaigns-live-timeline__body">
                <strong>No system events yet</strong>
                <span>This campaign does not have recent system events recorded.</span>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
