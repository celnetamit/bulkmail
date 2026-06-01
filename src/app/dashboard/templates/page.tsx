'use client';

import { FormEvent, useEffect, useState } from 'react';
import { EmailRichEditor, starterTemplate } from '@/components/email-rich-editor';

type Template = { id: string; name: string; subject: string; bodyHtml: string };

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState(starterTemplate('Hello {{firstName}},'));
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editName, setEditName] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editBodyHtml, setEditBodyHtml] = useState('');

  async function load() {
    const res = await fetch('/api/templates', { cache: 'no-store' });
    const data = (await res.json()) as { templates: Template[] };
    setTemplates(data.templates || []);
  }

  useEffect(() => { load(); }, []);

  async function createTemplate(event: FormEvent) {
    event.preventDefault();
    const res = await fetch('/api/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, subject, bodyHtml }) });
    if (!res.ok) return setMessage('Failed to create template.');
    setMessage('Template created.');
    setName('');
    setSubject('');
    setBodyHtml(starterTemplate('Hello {{firstName}},'));
    await load();
  }

  async function editTemplate(item: Template) {
    setEditingTemplate(item);
    setEditName(item.name);
    setEditSubject(item.subject);
    setEditBodyHtml(item.bodyHtml);
  }

  async function saveTemplateEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingTemplate) return;

    const res = await fetch(`/api/templates/${editingTemplate.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: editName, subject: editSubject, bodyHtml: editBodyHtml }),
    });
    if (!res.ok) return setMessage('Failed to update template.');
    setMessage('Template updated.');
    setEditingTemplate(null);
    await load();
  }

  async function deleteTemplate(id: string) {
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    if (!res.ok) return setMessage('Failed to delete template.');
    setMessage('Template deleted.');
    await load();
  }

  return (
    <div className="overview">
      <header className="page-header"><h1>Templates</h1><p>Create and maintain reusable email templates.</p></header>
      {message ? <p className="form-note">{message}</p> : null}
      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2>Create Template</h2>
        <form className="auth-form" onSubmit={createTemplate}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" required />
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" required />
          <EmailRichEditor value={bodyHtml} onChange={setBodyHtml} placeholder="Compose the template body..." />
          <button className="btn-primary" type="submit">Create Template</button>
        </form>
      </div>
      <div className="card">
        <table className="data-table"><thead><tr><th>Name</th><th>Subject</th><th>Actions</th></tr></thead><tbody>
          {templates.length === 0 ? <tr><td colSpan={3}>No templates yet.</td></tr> : templates.map((t) => (
            <tr key={t.id}><td>{t.name}</td><td>{t.subject}</td><td><button className="mini-btn" onClick={() => editTemplate(t)}>Edit</button><button className="mini-btn danger" onClick={() => deleteTemplate(t.id)}>Delete</button></td></tr>
          ))}
        </tbody></table>
      </div>
      {editingTemplate ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="template-editor-title">
            <h2 id="template-editor-title">Edit Template</h2>
            <form className="auth-form" onSubmit={saveTemplateEdit}>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Template name" required />
              <input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} placeholder="Email subject" required />
              <EmailRichEditor value={editBodyHtml} onChange={setEditBodyHtml} placeholder="Edit the template body..." />
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="mini-btn" onClick={() => setEditingTemplate(null)}>Cancel</button>
                <button className="btn-primary" type="submit">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
