'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { EmailRichEditor, starterTemplate } from '@/components/email-rich-editor';

type List = { id: string; name: string; isDefaultTestList?: number | boolean; contactsCount?: number; campaignsCount?: number };
type Template = { id: string; name: string; subject: string; bodyHtml: string };
type Campaign = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  status: string;
  list: { id: string; name: string };
  lists?: { id: string; name: string; isDefaultTestList: number | boolean }[];
  template: { id: string; name: string } | null;
};

type CampaignCreateClientProps = {
  campaignId?: string;
  templateIdFromQuery?: string;
};

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
  const [lists, setLists] = useState<List[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);
  const skipTemplateApplyRef = useRef(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(campaignId || null);

  const [name, setName] = useState('');
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState(starterTemplate('Campaign body'));

  async function loadAll() {
    setLoading(true);
    const [listsRes, templatesRes] = await Promise.all([
      fetch('/api/lists?all=true', { cache: 'no-store' }),
      fetch('/api/templates', { cache: 'no-store' }),
    ]);
    const listsData = (await readJsonResponse<{ lists: List[] }>(listsRes)) || { lists: [] };
    const templatesData = (await readJsonResponse<{ templates: Template[] }>(templatesRes)) || { templates: [] };
    const nextLists = listsData.lists || [];
    const nextTemplates = templatesData.templates || [];

    setLists(nextLists);
    setTemplates(nextTemplates);
    if (!editingCampaignId && selectedListIds.length === 0 && nextLists[0]) setSelectedListIds([nextLists[0].id]);
    if (!campaignId && templateIdFromQuery) setTemplateId(templateIdFromQuery);

    if (campaignId) {
      const campaignRes = await fetch(`/api/campaigns/${campaignId}`, { cache: 'no-store' });
      if (campaignRes.ok) {
        const campaignData = (await readJsonResponse<{ campaign?: Campaign }>(campaignRes)) || {};
        const campaign = campaignData.campaign;
        if (campaign) {
          skipTemplateApplyRef.current = true;
          setEditingCampaignId(campaign.id);
          setName(campaign.name);
          setSelectedListIds((campaign.lists && campaign.lists.length > 0 ? campaign.lists : campaign.list ? [campaign.list] : []).map((list) => list.id));
          setTemplateId(campaign.template?.id || '');
          setSubject(campaign.subject);
          setBodyHtml(campaign.bodyHtml);
          setMessage(`Editing ${campaign.name}.`);
        }
      }
    }

    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    const selected = templates.find((t) => t.id === templateId);
    if (skipTemplateApplyRef.current) {
      skipTemplateApplyRef.current = false;
      return;
    }
    if (selected && !editingCampaignId) {
      setSubject(selected.subject);
      setBodyHtml(selected.bodyHtml);
    }
  }, [templateId, editingCampaignId, templates]);

  function resetForm() {
    setEditingCampaignId(null);
    setName('');
    setSelectedListIds(lists[0]?.id ? [lists[0].id] : []);
    setTemplateId(templateIdFromQuery || '');
    setSubject('');
    setBodyHtml(starterTemplate('Campaign body'));
    setMessage('');
    router.replace(`/dashboard/campaigns/create${templateIdFromQuery ? `?templateId=${templateIdFromQuery}` : ''}`);
  }

  async function saveCampaign(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    if (selectedListIds.length === 0) {
      setSaving(false);
      setMessage('Select at least one list.');
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
      setMessage(data?.error || (editingCampaignId ? 'Failed to update campaign.' : 'Failed to create campaign.'));
      return;
    }

    setMessage(editingCampaignId ? 'Campaign draft updated.' : 'Campaign draft created.');
    router.push('/dashboard/campaigns');
  }

  async function testCampaign() {
    if (!editingCampaignId) return;

    setTesting(true);
    setMessage('');

    const res = await fetch(`/api/campaigns/${editingCampaignId}/test`, { method: 'POST' });
    const data = (await readJsonResponse<{ error?: string; sentCount?: number; failedCount?: number; testList?: { name?: string } }>(res)) || {};
    setTesting(false);

    if (!res.ok) {
      setMessage(data?.error || 'Failed to send test campaign.');
      return;
    }

    setMessage(`Test sent to ${data.testList?.name || 'your test list'}. Sent: ${data.sentCount ?? 0}, Failed: ${data.failedCount ?? 0}.`);
  }

  function toggleList(listId: string) {
    setSelectedListIds((current) => {
      if (current.includes(listId)) {
        return current.filter((currentId) => currentId !== listId);
      }
      return [...current, listId];
    });
  }

  const pageTitle = useMemo(() => (editingCampaignId ? 'Edit Campaign Draft' : 'Create Campaign Draft'), [editingCampaignId]);
  const hasDefaultTestList = useMemo(() => lists.some((list) => Boolean(list.isDefaultTestList)), [lists]);

  return (
    <div className="overview">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h1>{pageTitle}</h1>
            <p>Compose a campaign draft, attach a list, and keep the list view clean.</p>
          </div>
          <Link className="btn-secondary" href="/dashboard/campaigns">Back to Campaigns</Link>
        </div>
      </header>

      {message ? <p className="form-note">{message}</p> : null}

      <div className="card" style={{ padding: '1rem' }}>
        <form className="auth-form" onSubmit={saveCampaign}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" required />
          <div className="multi-select-panel">
            <div className="multi-select-panel__header">
              <span>Lists</span>
              <span>{selectedListIds.length} selected</span>
            </div>
            <div className="multi-select-panel__body">
              {lists.length === 0 ? (
                <p className="form-note">No lists yet. Create at least one list before saving the campaign.</p>
              ) : (
                lists.map((list) => (
                  <label key={list.id} className={`multi-select-option ${selectedListIds.includes(list.id) ? 'is-selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedListIds.includes(list.id)}
                      onChange={() => toggleList(list.id)}
                    />
                    <span className="multi-select-option__content">
                      <strong>{list.name}</strong>
                      {list.isDefaultTestList ? <span className="badge badge-success">Test list</span> : null}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
          <p className="form-note">
            {hasDefaultTestList
              ? 'One-click test sends use your default test list.'
              : 'Set a default test list in Lists to enable one-click test sends.'}
          </p>
          <select className="status-select" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">No Template</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" required />
          <EmailRichEditor value={bodyHtml} onChange={setBodyHtml} placeholder="Compose the campaign body..." />
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" type="submit" disabled={saving || loading}>
              {saving ? 'Saving...' : editingCampaignId ? 'Update Draft' : 'Create Draft'}
            </button>
            {editingCampaignId ? (
              <button
                className="btn-secondary"
                type="button"
                onClick={testCampaign}
                disabled={testing || saving || loading || !hasDefaultTestList}
                title={hasDefaultTestList ? 'Send this campaign to the default test list.' : 'Set a default test list in Lists first.'}
              >
                {testing ? 'Sending test...' : 'Test campaign'}
              </button>
            ) : null}
            <button className="mini-btn" type="button" onClick={resetForm}>
              Reset
            </button>
          </div>
          <p className="form-note">
            Use a default test list for one-click test sends, then select one or more customer lists for the real campaign.
          </p>
        </form>
      </div>
    </div>
  );
}
