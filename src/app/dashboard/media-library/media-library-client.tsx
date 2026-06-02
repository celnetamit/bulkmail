'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type MediaItem = {
  fileName: string;
  relativeUrl: string;
  url: string;
  size: number;
  lastModified: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function MediaLibraryClient({ pickMode }: { pickMode: boolean }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setMessage('');
    const response = await fetch('/api/uploads/media', { cache: 'no-store' });
    const data = (await response.json()) as { uploads?: MediaItem[]; error?: string };

    if (!response.ok) {
      setMessage(data.error || 'Failed to load uploaded media.');
      setItems([]);
      setLoading(false);
      return;
    }

    setItems(data.uploads || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => item.fileName.toLowerCase().includes(term));
  }, [items, search]);

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Image URL copied.');
    } catch {
      window.prompt('Copy this URL', url);
    }
  }

  function insertIntoEditor(url: string) {
    const target = window.opener;
    if (!target) {
      setMessage('Open this page from the editor to insert directly.');
      return;
    }

    target.postMessage({ type: 'mailflow.insert-media', url }, window.location.origin);
    window.close();
  }

  return (
    <div className="overview">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h1>Media Library</h1>
            <p>Browse previously uploaded images, copy their URLs, or insert one back into the email editor.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link className="btn-secondary" href="/dashboard/campaigns/create">Open Campaign Editor</Link>
            <Link className="btn-secondary" href="/dashboard/templates/create">Open Template Editor</Link>
          </div>
        </div>
      </header>

      {pickMode ? <p className="form-note">Pick mode is on. Click Insert to send an image back to the editor.</p> : null}
      {message ? <p className="form-note">{message}</p> : null}

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div className="media-library-toolbar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="auth-input"
            placeholder="Search uploaded images"
          />
          <button type="button" className="btn-secondary" onClick={load}>Refresh</button>
        </div>
      </div>

      <div className="media-library-grid">
        {loading ? (
          <div className="card media-library-empty">
            <h2>Loading media...</h2>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="card media-library-empty">
            <h2>No uploads yet.</h2>
            <p>Use the upload button in the visual email editor to add your first image.</p>
          </div>
        ) : filteredItems.map((item) => (
          <article className="card media-card" key={item.relativeUrl}>
            <div className="media-preview">
              <img src={item.url} alt={item.fileName} />
            </div>
            <div className="media-card__body">
              <strong title={item.fileName}>{item.fileName}</strong>
              <p>{formatBytes(item.size)} - {new Date(item.lastModified).toLocaleString()}</p>
              <p className="media-card__url">{item.url}</p>
              <div className="media-card__actions">
                <button type="button" className="mini-btn" onClick={() => copyUrl(item.url)}>Copy URL</button>
                {pickMode ? (
                  <button type="button" className="mini-btn" onClick={() => insertIntoEditor(item.url)}>Insert</button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
