'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { EmailRichEditor, starterTemplate } from '@/components/email-rich-editor';

type List = { id: string; name: string };
type Template = { id: string; name: string; subject: string; bodyHtml: string };
type Campaign = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  status: string;
  list: { id: string; name: string };
  template: { id: string; name: string } | null;
};

type CampaignCreateClientProps = {
  campaignId?: string;
  templateIdFromQuery?: string;
};

export function CampaignCreateClient({ campaignId, templateIdFromQuery }: CampaignCreateClientProps) {
  const router = useRouter();
  const [lists, setLists] = useState<List[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const skipTemplateApplyRef = useRef(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(campaignId || null);

  const [name, setName] = useState('');
  const [listId, setListId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState(starterTemplate('Campaign body'));

  async function loadAll() {
    setLoading(true);
    const [listsRes, templatesRes] = await Promise.all([
      fetch('/api/lists', { cache: 'no-store' }),
      fetch('/api/templates', { cache: 'no-store' }),
    ]);
    const listsData = (await listsRes.json()) as { lists: List[] };
    const templatesData = (await templatesRes.json()) as { templates: Template[] };
    const nextLists = listsData.lists || [];
    const nextTemplates = templatesData.templates || [];

    setLists(nextLists);
    setTemplates(nextTemplates);
    if (!listId && nextLists[0]) setListId(nextLists[0].id);
    if (!campaignId && templateIdFromQuery) setTemplateId(templateIdFromQuery);

    if (campaignId) {
      const campaignRes = await fetch(`/api/campaigns/${campaignId}`, { cache: 'no-store' });
      if (campaignRes.ok) {
        const campaignData = (await campaignRes.json()) as { campaign?: Campaign };
        const campaign = campaignData.campaign;
        if (campaign) {
          skipTemplateApplyRef.current = true;
          setEditingCampaignId(campaign.id);
          setName(campaign.name);
          setListId(campaign.list?.id || '');
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
    setListId(lists[0]?.id || '');
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

    const payload = { name, listId, subject, bodyHtml, templateId: templateId || null };
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

    setSaving(false);
    if (!res.ok) {
      setMessage(editingCampaignId ? 'Failed to update campaign.' : 'Failed to create campaign.');
      return;
    }

    setMessage(editingCampaignId ? 'Campaign draft updated.' : 'Campaign draft created.');
    router.push('/dashboard/campaigns');
  }

  const pageTitle = useMemo(() => (editingCampaignId ? 'Edit Campaign Draft' : 'Create Campaign Draft'), [editingCampaignId]);

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
          <select className="status-select" value={listId} onChange={(e) => setListId(e.target.value)} required>
            <option value="">Select List</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
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
            <button className="mini-btn" type="button" onClick={resetForm}>
              Reset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
