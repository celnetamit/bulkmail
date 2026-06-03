'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { EmailRichEditor, starterTemplate } from '@/components/email-rich-editor';
import { EmailMagicComposer } from '@/components/email-magic-composer';
import { useToast } from '@/components/toast-provider';

type Template = { id: string; name: string; subject: string; bodyHtml: string };

type TemplateCreateClientProps = {
  templateId?: string;
};

export function TemplateCreateClient({ templateId }: TemplateCreateClientProps) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(templateId || null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState(starterTemplate('Hello {{firstName}},'));

  async function loadTemplate() {
    setLoading(true);
    if (templateId) {
      const res = await fetch(`/api/templates/${templateId}`, { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as { template?: Template };
        if (data.template) {
          setEditingTemplateId(data.template.id);
          setName(data.template.name);
          setSubject(data.template.subject);
          setBodyHtml(data.template.bodyHtml);
        }
      }
      else {
        toast.error('Template load failed', 'The requested template could not be opened.');
      }
    }
    setLoading(false);
  }

  useEffect(() => { loadTemplate(); }, []);

  function resetForm() {
    setEditingTemplateId(null);
    setName('');
    setSubject('');
    setBodyHtml(starterTemplate('Hello {{firstName}},'));
    router.replace(`/dashboard/templates/create${templateId ? `?templateId=${templateId}` : ''}`);
    toast.info('Form reset', 'The template draft has been reset.');
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);

    const res = editingTemplateId
      ? await fetch(`/api/templates/${editingTemplateId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, subject, bodyHtml }),
        })
      : await fetch('/api/templates', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, subject, bodyHtml }),
        });

    setSaving(false);
    if (!res.ok) {
      toast.error(
        editingTemplateId ? 'Template update failed' : 'Template creation failed',
        'Please review the draft and try again.',
      );
      return;
    }

    toast.success(
      editingTemplateId ? 'Template updated' : 'Template created',
      editingTemplateId ? 'Your changes were saved successfully.' : 'The new template draft is ready.',
    );
    router.push('/dashboard/templates');
  }

  const pageTitle = useMemo(() => (editingTemplateId ? 'Edit Template' : 'Create Template'), [editingTemplateId]);

  return (
    <div className="overview">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h1>{pageTitle}</h1>
            <p>Build the reusable template in a dedicated page so the list stays simple.</p>
          </div>
          <Link className="btn-secondary" href="/dashboard/templates">Back to Templates</Link>
        </div>
      </header>
      <div className="card" style={{ padding: '1rem' }}>
        <form className="auth-form" onSubmit={saveTemplate}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" required />
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" required />
          <EmailMagicComposer
            surface="template"
            draftName={name}
            subject={subject}
            bodyHtml={bodyHtml}
            disabled={saving || loading}
            onApply={({ subject: nextSubject, bodyHtml: nextBodyHtml }) => {
              setSubject(nextSubject);
              setBodyHtml(nextBodyHtml);
            }}
          />
          <EmailRichEditor value={bodyHtml} onChange={setBodyHtml} placeholder="Compose the template body..." />
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" type="submit" disabled={saving || loading}>
              {saving ? 'Saving...' : editingTemplateId ? 'Update Template' : 'Create Template'}
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
