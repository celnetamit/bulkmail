'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { starterTemplate } from '@/components/email-rich-editor';
import SearchableMultiSelect from '@/components/searchable-multiselect';
import { useToast } from '@/components/toast-provider';

type List = { id: string; name: string; isDefaultTestList?: number | boolean; contactsCount?: number; campaignsCount?: number };
type Template = { id: string; name: string; subject: string; bodyHtml: string };
type SenderIdentity = {
  defaultFromName: string;
  defaultFromEmail: string;
  defaultReplyToEmail: string;
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  senderFromName: string;
  senderFromEmail: string;
  senderReplyToEmail: string;
};
type Campaign = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  status: string;
  list: { id: string; name: string };
  lists?: { id: string; name: string; isDefaultTestList: number | boolean }[];
  template: { id: string; name: string } | null;
  lastJob?: { skipReason?: string | null; lastError?: string | null; status?: string | null; finishedAt?: string | null } | null;
};

const READ_ONLY_CAMPAIGN_STATUSES = new Set(['SENT']);

type CampaignRiskSeverity = 'block' | 'warning' | 'info';
type CampaignRiskStatus = 'blocked' | 'warning' | 'ready';
type CampaignRiskItem = {
  key: string;
  title: string;
  detail: string;
  severity: CampaignRiskSeverity;
  category: 'compliance' | 'spam' | 'audience' | 'deliverability';
};
type CampaignRiskResult = {
  status: CampaignRiskStatus;
  score: number;
  summary: string;
  counts: {
    blocks: number;
    warnings: number;
    infos: number;
  };
  audience: {
    lists: number;
    totalContacts: number;
    subscribedContacts: number;
    suppressedContacts: number;
    invalidContacts: number;
    duplicateContacts: number;
  };
  items: CampaignRiskItem[];
};

type CampaignCreateClientProps = {
  campaignId?: string;
  templateIdFromQuery?: string;
};

const EmailRichEditor = dynamic(
  () => import('@/components/email-rich-editor').then((mod) => mod.EmailRichEditor),
  {
    ssr: false,
    loading: () => (
      <div className="card" style={{ padding: '1rem' }}>
        <p className="form-note">Loading email editor...</p>
      </div>
    ),
  },
);

const EmailMagicComposer = dynamic(
  () => import('@/components/email-magic-composer').then((mod) => mod.EmailMagicComposer),
  {
    ssr: false,
    loading: () => (
      <div className="card" style={{ padding: '1rem' }}>
        <p className="form-note">Loading AI assistant...</p>
      </div>
    ),
  },
);

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function CampaignCreateClient({ campaignId, templateIdFromQuery }: CampaignCreateClientProps) {
  const router = useRouter();
  const toast = useToast();
  const [lists, setLists] = useState<List[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [riskLoading, setRiskLoading] = useState(false);
  const [risk, setRisk] = useState<CampaignRiskResult | null>(null);
  const [senderIdentity, setSenderIdentity] = useState<SenderIdentity | null>(null);
  const [lastJob, setLastJob] = useState<{ skipReason?: string | null; lastError?: string | null; status?: string | null; finishedAt?: string | null } | null>(null);
  const [campaignStatus, setCampaignStatus] = useState<string | null>(null);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(campaignId || null);
  const campaignHydratedRef = useRef(!campaignId);
  const nameTouchedRef = useRef(false);

  const [name, setName] = useState('');
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState(starterTemplate('Campaign body'));
  const templateChangeRef = useRef(templateId);
  // Tracks the template id whose content was last applied to subject/body, so the
  // auto-fill effect only runs when the user actually changes the template
  // selection — never on hydration or unrelated re-renders.
  const lastAppliedTemplateRef = useRef('');
  const [templatePulseVariant, setTemplatePulseVariant] = useState<0 | 1>(0);

  async function loadCampaignRisk(nextCampaignId: string) {
    setRiskLoading(true);
    const riskRes = await fetch(`/api/campaigns/${nextCampaignId}/risk`, { cache: 'no-store' });
    const riskData = (await readJsonResponse<{ risk?: CampaignRiskResult }>(riskRes)) || {};
    setRisk(riskRes.ok ? riskData.risk || null : null);
    setRiskLoading(false);
  }

  async function loadAll() {
    setLoading(true);
    const [listsRes, templatesRes, settingsRes] = await Promise.all([
      fetch('/api/lists?all=true&owner=self', { cache: 'no-store' }),
      fetch('/api/templates?owner=self', { cache: 'no-store' }),
      fetch('/api/settings', { cache: 'no-store' }),
    ]);
    const listsData = (await readJsonResponse<{ lists: List[] }>(listsRes)) || { lists: [] };
    const templatesData = (await readJsonResponse<{ templates: Template[] }>(templatesRes)) || { templates: [] };
    const settingsData = (await readJsonResponse<{ senderIdentity?: SenderIdentity }>(settingsRes)) || {};
    const nextLists = listsData.lists || [];
    const nextTemplates = templatesData.templates || [];

    setLists(nextLists);
    setTemplates(nextTemplates);
    setSenderIdentity(settingsData.senderIdentity || null);
    if (!editingCampaignId && selectedListIds.length === 0 && nextLists[0]) setSelectedListIds([nextLists[0].id]);
    if (!campaignId && templateIdFromQuery) setTemplateId(templateIdFromQuery);

    if (campaignId) {
      campaignHydratedRef.current = false;
      const campaignRes = await fetch(`/api/campaigns/${campaignId}`, { cache: 'no-store' });
      if (campaignRes.ok) {
        const campaignData = (await readJsonResponse<{ campaign?: Campaign }>(campaignRes)) || {};
        const campaign = campaignData.campaign;
        if (campaign) {
          setEditingCampaignId(campaign.id);
          setCampaignStatus(campaign.status);
          setName(campaign.name);
          nameTouchedRef.current = false;
          setSelectedListIds((campaign.lists && campaign.lists.length > 0 ? campaign.lists : campaign.list ? [campaign.list] : []).map((list) => list.id));
          // Seed the applied-template ref to the campaign's template so the
          // auto-fill effect treats it as already applied and preserves the
          // campaign's saved (possibly edited) subject/body below.
          lastAppliedTemplateRef.current = campaign.template?.id || '';
          setTemplateId(campaign.template?.id || '');
          setSubject(campaign.subject);
          setBodyHtml(campaign.bodyHtml);
          setLastJob((campaign as any).lastJob || null);
          await loadCampaignRisk(campaign.id);
        }
      } else {
        toast.error('Campaign load failed', 'The requested campaign draft could not be opened.');
      }
      campaignHydratedRef.current = true;
    }

    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    // Wait until an existing campaign has hydrated before touching content.
    if (campaignId && !campaignHydratedRef.current) {
      return;
    }
    // Only apply template content when the template SELECTION actually changes
    // (the user picked a template). Hydration, a name keystroke, or templates
    // finishing loading must never clobber the campaign's edited content.
    if (templateId === lastAppliedTemplateRef.current) {
      return;
    }
    const selected = templates.find((t) => t.id === templateId);
    // If a template is selected but the templates list hasn't loaded yet, wait
    // for it (don't mark as applied) so the content is filled once available.
    if (templateId && !selected) {
      return;
    }
    lastAppliedTemplateRef.current = templateId;
    if (selected) {
      setSubject(selected.subject);
      setBodyHtml(selected.bodyHtml);
      if (!nameTouchedRef.current || !name.trim()) {
        setName(selected.name);
      }
    }
  }, [campaignId, name, templateId, templates]);

  useEffect(() => {
    if (templateChangeRef.current !== templateId) {
      templateChangeRef.current = templateId;
      if (templateId) {
        setTemplatePulseVariant((current) => (current === 0 ? 1 : 0));
      }
    }
  }, [templateId]);

  function resetForm() {
    setEditingCampaignId(null);
    setName('');
    nameTouchedRef.current = false;
    setSelectedListIds(lists[0]?.id ? [lists[0].id] : []);
    setTemplateId(templateIdFromQuery || '');
    setSubject('');
    setBodyHtml(starterTemplate('Campaign body'));
    setRisk(null);
    router.replace(`/dashboard/campaigns/create${templateIdFromQuery ? `?templateId=${templateIdFromQuery}` : ''}`);
    toast.info('Form reset', 'The campaign draft has been reset.');
  }

  async function saveCampaign(event: FormEvent) {
    event.preventDefault();
    if (isReadOnlyCampaign) {
      toast.warning('Sent campaigns are read-only', 'Copy this campaign to create a new editable draft.');
      return;
    }
    setSaving(true);

    if (selectedListIds.length === 0) {
      setSaving(false);
      toast.warning('Select a list', 'Choose at least one audience list before saving the campaign.');
      return;
    }

    const payload = { name, listIds: selectedListIds, listId: selectedListIds[0] || '', subject, bodyHtml, templateId: templateId || null };
    const res = editingCampaignId
      ? await fetch(`/api/campaigns/${editingCampaignId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...payload, status: 'DRAFT' }),
        })
      : await fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });

    const data = (await readJsonResponse<{ error?: string }>(res)) || null;
    setSaving(false);
    if (!res.ok) {
      toast.error(
        editingCampaignId ? 'Campaign update failed' : 'Campaign creation failed',
        data?.error || 'Please review the draft and try again.',
      );
      return;
    }

    toast.success(
      editingCampaignId ? 'Campaign updated' : 'Campaign created',
      editingCampaignId ? 'The draft changes were saved.' : 'The new campaign draft is ready.',
    );
    router.push('/dashboard/campaigns');
  }

  async function testCampaign() {
    if (!editingCampaignId) return;
    if (isReadOnlyCampaign) {
      toast.warning('Sent campaigns are read-only', 'Copy this campaign before running a test send.');
      return;
    }

    setTesting(true);

    const res = await fetch(`/api/campaigns/${editingCampaignId}/test`, { method: 'POST' });
    const data = (await readJsonResponse<{ error?: string; sentCount?: number; failedCount?: number; testList?: { name?: string } }>(res)) || {};
    setTesting(false);

    if (!res.ok) {
      toast.error('Test send failed', data?.error || 'The test campaign could not be sent.');
      return;
    }

    toast.success(
      'Test campaign sent',
      `Sent to ${data.testList?.name || 'your test list'}. Sent: ${data.sentCount ?? 0}, Failed: ${data.failedCount ?? 0}.`,
    );
  }


  const isReadOnlyCampaign = Boolean(editingCampaignId && campaignStatus && READ_ONLY_CAMPAIGN_STATUSES.has(campaignStatus));
  const pageTitle = useMemo(
    () => (editingCampaignId ? (isReadOnlyCampaign ? 'View Sent Campaign' : 'Edit Campaign Draft') : 'Create Campaign Draft'),
    [editingCampaignId, isReadOnlyCampaign],
  );
  const hasDefaultTestList = useMemo(() => lists.some((list) => Boolean(list.isDefaultTestList)), [lists]);
  const riskStatusClass = risk?.status === 'ready' ? 'badge-success' : risk?.status === 'blocked' ? 'badge-danger' : 'badge-warning';
  const selectedListNames = useMemo(
    () => lists.filter((list) => selectedListIds.includes(list.id)).map((list) => list.name),
    [lists, selectedListIds],
  );
  const linkedTemplateName = useMemo(
    () => templates.find((template) => template.id === templateId)?.name || null,
    [templateId, templates],
  );
  const visibleSenderName = senderIdentity?.senderFromName || senderIdentity?.defaultFromName || '';
  const visibleSenderEmail = senderIdentity?.senderFromEmail || senderIdentity?.defaultFromEmail || '';
  const visibleReplyToEmail = senderIdentity?.senderReplyToEmail || senderIdentity?.defaultReplyToEmail || '';
  const senderIdentitySummary = visibleSenderName && visibleSenderEmail ? `${visibleSenderName} <${visibleSenderEmail}>` : visibleSenderEmail || visibleSenderName || 'Not set';

  function severityClass(severity: CampaignRiskSeverity) {
    if (severity === 'block') return 'badge-danger';
    if (severity === 'warning') return 'badge-warning';
    return 'badge-info';
  }

  return (
    <div className="overview">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h1>{pageTitle}</h1>
            <p>
              {isReadOnlyCampaign
                ? 'This campaign has already been sent, so it is read-only. Use Copy to create a new draft.'
                : 'Compose a campaign draft, attach a list, and review the sender identity before sending.'}
            </p>
          </div>
          <Link className="btn-secondary" href="/dashboard/campaigns">Back to Campaigns</Link>
        </div>
      </header>
      {editingCampaignId ? (
        <section className="card campaign-risk-panel">
          <div className="campaign-risk-panel__header">
            <div>
              <h2>Campaign Risk Check</h2>
              <p>{riskLoading ? 'Checking compliance, spam, audience, and deliverability signals...' : risk?.summary || 'Run a scan after saving the draft.'}</p>
              {lastJob ? (
                <p style={{ marginTop: '0.4rem', color: '#94a3b8' }}>
                  Last send: {lastJob.status || 'N/A'}{lastJob.finishedAt ? ` — ${new Date(lastJob.finishedAt).toLocaleString()}` : ''}
                </p>
              ) : null}
            </div>
            {risk ? <span className={`badge ${riskStatusClass}`}>{risk.status}</span> : null}
          </div>

          {risk ? (
            <>
              <div className="campaign-risk-stats">
                <span><strong>{risk.score}</strong> risk score</span>
                <span><strong>{risk.counts.blocks}</strong> blocks</span>
                <span><strong>{risk.counts.warnings}</strong> warnings</span>
                <span><strong>{risk.audience.subscribedContacts}</strong> subscribed</span>
                <span><strong>{risk.audience.suppressedContacts}</strong> suppressed</span>
              </div>
              <div className="campaign-risk-list">
                {risk.items.length === 0 ? (
                  <p className="form-note">No campaign risk issues detected.</p>
                ) : (
                  risk.items.map((item) => (
                    <article className="campaign-risk-item" key={item.key}>
                      <div className="campaign-risk-item__head">
                        <span className={`badge ${severityClass(item.severity)}`}>{item.severity}</span>
                        <span className="badge badge-info">{item.category}</span>
                      </div>
                      <h3>{item.title}</h3>
                      <p>{item.detail}</p>
                    </article>
                  ))
                )}
              </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {lastJob?.skipReason ? <p className="form-note">Skip reason: {lastJob.skipReason}</p> : null}
                  {lastJob?.lastError ? (
                    <button className="mini-btn" type="button" onClick={() => alert(lastJob.lastError)}>
                      View last error
                    </button>
                  ) : null}
                </div>
                <button className="mini-btn" type="button" onClick={() => loadCampaignRisk(editingCampaignId)} disabled={riskLoading}>
                {riskLoading ? 'Checking...' : 'Refresh Check'}
              </button>
            </>
          ) : null}
        </section>
      ) : null}

      <div className="card" style={{ padding: '1rem' }}>
        <form className="auth-form" onSubmit={saveCampaign}>
          {isReadOnlyCampaign ? (
            <div className="badge badge-info" style={{ marginBottom: '0.75rem' }}>
              Sent campaign read-only
            </div>
          ) : null}
          <fieldset disabled={saving || testing || loading || isReadOnlyCampaign} style={{ border: 0, padding: 0, margin: 0 }}>
          <input
            value={name}
            onChange={(e) => {
              nameTouchedRef.current = true;
              setName(e.target.value);
            }}
            placeholder="Campaign name"
            required
          />
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{ display: 'block', marginBottom: '.5rem', color: 'var(--muted-text)' }}>Lists</label>
            <SearchableMultiSelect
              lists={lists}
              selectedIds={selectedListIds}
              onChange={setSelectedListIds}
              placeholder="Select lists..."
              disabled={isReadOnlyCampaign}
            />
            {lists.length === 0 ? (
              <p className="form-note">No lists yet. Create at least one list before saving the campaign.</p>
            ) : null}
          </div>
          <p className="form-note">
            {hasDefaultTestList
              ? 'One-click test sends use your default test list.'
              : 'Set a default test list in Lists to enable one-click test sends.'}
          </p>
          <div className="campaign-template-picker">
            <label className="campaign-template-picker__label" htmlFor="campaign-template">
              Template
            </label>
            <select
              id="campaign-template"
              className="status-select campaign-template-picker__select"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">No Template</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div className="campaign-template-picker__hint">
              <span className="campaign-template-picker__selected">
                {linkedTemplateName ? `Selected: ${linkedTemplateName}` : 'No template selected'}
              </span>
              <span className="badge badge-info campaign-template-picker__badge">Will fill fields</span>
            </div>
          </div>
          <div className={`campaign-template-field ${linkedTemplateName ? 'campaign-template-field--ghost' : ''} ${linkedTemplateName ? `campaign-template-field--pulse-${templatePulseVariant}` : ''}`}>
            <div className="campaign-template-field__topline">
              <label className="campaign-template-field__label" htmlFor="campaign-subject">
                Subject
              </label>
              {linkedTemplateName ? <span className="campaign-template-field__status">Auto-filled from {linkedTemplateName}</span> : null}
            </div>
            <input
              id="campaign-subject"
              className="campaign-template-field__input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              required
            />
          </div>
          <EmailMagicComposer
            surface="campaign"
            draftName={name}
            subject={subject}
            bodyHtml={bodyHtml}
            linkedTemplateName={linkedTemplateName}
            listNames={selectedListNames}
            disabled={saving || testing || loading || isReadOnlyCampaign}
            onApply={({ subject: nextSubject, bodyHtml: nextBodyHtml }) => {
              setSubject(nextSubject);
              setBodyHtml(nextBodyHtml);
            }}
          />
          <div className={`campaign-template-field campaign-template-field--body ${linkedTemplateName ? 'campaign-template-field--ghost' : ''} ${linkedTemplateName ? `campaign-template-field--pulse-${templatePulseVariant}` : ''}`}>
            <div className="campaign-template-field__topline">
              <label className="campaign-template-field__label">Body</label>
              {linkedTemplateName ? <span className="campaign-template-field__status">Auto-filled from {linkedTemplateName}</span> : null}
            </div>
            <EmailRichEditor value={bodyHtml} onChange={setBodyHtml} placeholder="Compose the campaign body..." disabled={isReadOnlyCampaign} />
          </div>
          <section className="card" style={{ padding: '1rem', background: 'rgba(15, 23, 42, 0.35)' }}>
            <div className="campaign-risk-panel__header" style={{ marginBottom: '0.75rem' }}>
              <div>
                <h2 style={{ marginBottom: '0.25rem' }}>Sender Identity</h2>
                <p className="form-note" style={{ marginBottom: 0 }}>
                  This is the sender profile recipients will see right before the campaign is dispatched.
                </p>
              </div>
              <span className="badge badge-info">Pre-send check</span>
            </div>
            <p style={{ marginBottom: '0.5rem' }}>
              <strong>From:</strong> {senderIdentitySummary}
            </p>
            <p className="form-note" style={{ marginBottom: '0.75rem' }}>
              <strong>Reply-to:</strong> {visibleReplyToEmail || 'Same as sender'}
            </p>
            <p className="form-note" style={{ marginBottom: '0.75rem' }}>
              Leaving Sender name blank uses the logged-in user&apos;s name by default.
            </p>
            <Link className="btn-secondary" href="/dashboard/settings">
              Update in Settings
            </Link>
          </section>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" type="submit" disabled={saving || loading || isReadOnlyCampaign}>
              {saving ? 'Saving...' : editingCampaignId ? (isReadOnlyCampaign ? 'Read Only' : 'Update Draft') : 'Create Draft'}
            </button>
            {editingCampaignId ? (
              <button
                className="btn-secondary"
                type="button"
                onClick={testCampaign}
                disabled={testing || saving || loading || !hasDefaultTestList || isReadOnlyCampaign}
                title={isReadOnlyCampaign ? 'Sent campaigns are read-only.' : hasDefaultTestList ? 'Send this campaign to the default test list.' : 'Set a default test list in Lists first.'}
              >
                {testing ? 'Sending test...' : 'Test campaign'}
              </button>
            ) : null}
            <button className="mini-btn" type="button" onClick={resetForm} disabled={isReadOnlyCampaign}>
              Reset
            </button>
          </div>
          <p className="form-note">
            Use a default test list for one-click test sends, then select one or more customer lists for the real campaign.
          </p>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
