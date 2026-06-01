'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Template = { id: string; name: string; subject: string; bodyHtml: string };

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [message, setMessage] = useState('');

  async function load() {
    const res = await fetch('/api/templates', { cache: 'no-store' });
    const data = (await res.json()) as { templates: Template[] };
    setTemplates(data.templates || []);
  }

  useEffect(() => { load(); }, []);

  async function deleteTemplate(id: string) {
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    if (!res.ok) return setMessage('Failed to delete template.');
    setMessage('Template deleted.');
    await load();
  }

  return (
    <div className="overview">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h1>Templates</h1>
            <p>Browse reusable templates, then open a dedicated page to create or edit one.</p>
          </div>
          <button className="btn-secondary" type="button" onClick={() => router.push('/dashboard/templates/create')}>
            New Template
          </button>
        </div>
      </header>

      {message ? <p className="form-note">{message}</p> : null}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Subject</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 ? (
              <tr><td colSpan={3}>No templates yet.</td></tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.subject}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <button className="mini-btn" type="button" onClick={() => router.push(`/dashboard/templates/create?templateId=${t.id}`)}>Edit</button>
                      <button className="mini-btn danger" type="button" onClick={() => deleteTemplate(t.id)}>Delete</button>
                      <Link className="mini-btn" href={`/dashboard/campaigns/create?templateId=${t.id}`}>Use in Campaign</Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
