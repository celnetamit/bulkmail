'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/toast-provider';

type MediaItem = {
  fileName: string;
  relativeUrl: string;
  url: string;
  size: number;
  lastModified: string;
  folder: string;
  tags: string[];
  title: string;
  width: number | null;
  height: number | null;
};

type UploadResponse = {
  url?: string;
  relativeUrl?: string;
  fileName?: string;
  size?: number;
  maxUploadKb?: number;
  folder?: string;
  tags?: string[];
  title?: string;
  width?: number | null;
  height?: number | null;
  error?: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function normalizeTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 12);
}

export default function MediaLibraryClient({ pickMode }: { pickMode: boolean }) {
  const toast = useToast();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [search, setSearch] = useState('');
  const [folderFilter, setFolderFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFolder, setUploadFolder] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadWidth, setUploadWidth] = useState('');
  const [uploadHeight, setUploadHeight] = useState('');
  const [savingKey, setSavingKey] = useState('');
  const [editDrafts, setEditDrafts] = useState<Record<string, { folder: string; tags: string; title: string; width: string; height: string }>>({});

  async function load() {
    setLoading(true);
    const response = await fetch('/api/uploads/media', { cache: 'no-store' });
    const data = (await response.json()) as { uploads?: MediaItem[]; error?: string };

    if (!response.ok) {
      toast.error('Media load failed', data.error || 'Uploaded media could not be loaded.');
      setItems([]);
      setLoading(false);
      return;
    }

    const nextItems = data.uploads || [];
    setItems(nextItems);
    setEditDrafts((current) => {
      const nextDrafts: Record<string, { folder: string; tags: string; title: string; width: string; height: string }> = {};
      for (const item of nextItems) {
        nextDrafts[item.relativeUrl] = current[item.relativeUrl] || {
          folder: item.folder || '',
          tags: item.tags.join(', '),
          title: item.title || '',
          width: item.width ? String(item.width) : '',
          height: item.height ? String(item.height) : '',
        };
      }
      return nextDrafts;
    });
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const folders = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.folder).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const tagChoices = useMemo(() => {
    return Array.from(new Set(items.flatMap((item) => item.tags).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const folderTerm = folderFilter === 'all' ? '' : folderFilter.toLowerCase();
    const tagTerm = tagFilter.trim().toLowerCase();

    return items.filter((item) => {
      const searchable = [item.fileName, item.title, item.folder, ...item.tags].join(' ').toLowerCase();
      const matchesSearch = !term || searchable.includes(term);
      const matchesFolder = !folderTerm || item.folder.toLowerCase() === folderTerm;
      const matchesTag = !tagTerm || item.tags.some((tag) => tag.includes(tagTerm));
      return matchesSearch && matchesFolder && matchesTag;
    });
  }, [folderFilter, items, search, tagFilter]);

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Image URL copied', 'The media URL is ready to paste.');
    } catch {
      window.prompt('Copy this URL', url);
    }
  }

  function insertIntoEditor(item: MediaItem) {
    const target = window.opener;
    if (!target) {
      toast.warning('Insert unavailable', 'Open this page from the editor to insert directly.');
      return;
    }

    target.postMessage(
      {
        type: 'mailflow.insert-media',
        url: item.url,
        alt: item.title || item.fileName,
        width: item.width,
        height: item.height,
      },
      window.location.origin,
    );
    window.close();
  }

  async function uploadSelected() {
    if (!uploadFile) {
      toast.warning('Choose an image', 'Select an image before uploading.');
      return;
    }

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('folder', uploadFolder);
    formData.append('tags', uploadTags);
    formData.append('title', uploadTitle);
    formData.append('width', uploadWidth);
    formData.append('height', uploadHeight);

    setUploading(true);

    try {
      const response = await fetch('/api/uploads/media', {
        method: 'POST',
        body: formData,
      });

      const data = (await response.json()) as UploadResponse;
      if (!response.ok) {
        toast.error('Upload failed', data.error || 'The image could not be uploaded.');
        return;
      }

      setUploadFile(null);
      setUploadFolder('');
      setUploadTags('');
      setUploadTitle('');
      setUploadWidth('');
      setUploadHeight('');
      toast.success('Image uploaded', 'The media file is now available in the library.');
      await load();
    } catch {
      toast.error('Upload failed', 'Please try the upload again.');
    } finally {
      setUploading(false);
    }
  }

  function updateDraft(relativeUrl: string, field: 'folder' | 'tags' | 'title' | 'width' | 'height', value: string) {
    setEditDrafts((current) => ({
      ...current,
      [relativeUrl]: {
        folder: current[relativeUrl]?.folder || '',
        tags: current[relativeUrl]?.tags || '',
        title: current[relativeUrl]?.title || '',
        width: current[relativeUrl]?.width || '',
        height: current[relativeUrl]?.height || '',
        [field]: value,
      },
    }));
  }

  async function saveMetadata(item: MediaItem) {
    const draft = editDrafts[item.relativeUrl];
    if (!draft) return;

    setSavingKey(item.relativeUrl);

    try {
      const response = await fetch('/api/uploads/media', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: item.fileName,
          folder: draft.folder,
          tags: draft.tags,
          title: draft.title,
          width: draft.width,
          height: draft.height,
        }),
      });

      const data = (await response.json()) as UploadResponse;
      if (!response.ok) {
        toast.error('Metadata save failed', data.error || 'The media details could not be saved.');
        return;
      }

      toast.success('Media updated', `Saved metadata for ${item.fileName}.`);
      await load();
    } finally {
      setSavingKey('');
    }
  }

  return (
    <div className="overview">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h1>Media Library</h1>
            <p>Browse uploaded images, organize them with folders and tags, and copy or insert them back into email content.</p>
          </div>
          <div className="header-actions">
            <Link className="btn-secondary" href="/dashboard/campaigns/create">Open Campaign Editor</Link>
            <Link className="btn-secondary" href="/dashboard/templates/create">Open Template Editor</Link>
          </div>
        </div>
      </header>

      {pickMode ? <p className="form-note">Pick mode is on. Click Insert to send an image back to the editor.</p> : null}

      <div className="card dashboard-panel" style={{ marginBottom: '1rem' }}>
        <div className="section-header section-header--compact">
          <div>
            <h2>Upload image</h2>
            <p>Upload a new asset, assign a folder, and tag it so it stays easy to find later.</p>
          </div>
        </div>
        <div className="media-library-upload">
          <input className="auth-input" type="file" accept="image/*" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
          <input className="auth-input" value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="Title" />
          <input className="auth-input" value={uploadFolder} onChange={(event) => setUploadFolder(event.target.value)} placeholder="Folder" />
          <input className="auth-input" value={uploadTags} onChange={(event) => setUploadTags(event.target.value)} placeholder="Tags (comma separated)" />
          <input className="auth-input" type="number" min={1} step={1} value={uploadWidth} onChange={(event) => setUploadWidth(event.target.value)} placeholder="Display width (px)" />
          <input className="auth-input" type="number" min={1} step={1} value={uploadHeight} onChange={(event) => setUploadHeight(event.target.value)} placeholder="Display height (px)" />
          <button type="button" className="btn-primary" onClick={uploadSelected} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>

      <div className="card dashboard-panel" style={{ marginBottom: '1rem' }}>
        <div className="media-library-toolbar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="auth-input"
            placeholder="Search by file name, title, folder, or tags"
          />
          <select className="status-select" value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)}>
            <option value="all">All folders</option>
            {folders.map((folder) => (
              <option key={folder} value={folder}>{folder}</option>
            ))}
          </select>
          <input
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
            className="auth-input"
            placeholder="Filter by tag"
            list="media-tags"
          />
          <datalist id="media-tags">
            {tagChoices.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
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
            <p>Use the upload form above or the upload button in the visual email editor to add your first image.</p>
          </div>
        ) : filteredItems.map((item) => {
          const draft = editDrafts[item.relativeUrl] || {
            folder: item.folder,
            tags: item.tags.join(', '),
            title: item.title,
            width: item.width ? String(item.width) : '',
            height: item.height ? String(item.height) : '',
          };
          return (
            <article className="card media-card" key={item.relativeUrl}>
              <div className="media-preview">
                <img src={item.url} alt={item.title || item.fileName} />
              </div>
              <div className="media-card__body">
                <strong title={item.title || item.fileName}>{item.title || item.fileName}</strong>
                <p>{formatBytes(item.size)} - {new Date(item.lastModified).toLocaleString()}</p>
                {item.width || item.height ? (
                  <p>{item.width ? `${item.width}px` : 'auto'} x {item.height ? `${item.height}px` : 'auto'}</p>
                ) : null}
                <div className="media-card__meta">
                  {item.folder ? <span className="badge badge-info">Folder: {item.folder}</span> : <span className="badge badge-info">No folder</span>}
                  {item.tags.length ? item.tags.map((tag) => <span className="badge" key={`${item.relativeUrl}-${tag}`}>{tag}</span>) : <span className="badge">No tags</span>}
                </div>
                <div className="media-card__edit">
                  <input
                    className="auth-input"
                    value={draft.title}
                    onChange={(event) => updateDraft(item.relativeUrl, 'title', event.target.value)}
                    placeholder="Title"
                  />
                  <input
                    className="auth-input"
                    value={draft.folder}
                    onChange={(event) => updateDraft(item.relativeUrl, 'folder', event.target.value)}
                    placeholder="Folder"
                  />
                  <input
                    className="auth-input"
                    value={draft.tags}
                    onChange={(event) => updateDraft(item.relativeUrl, 'tags', event.target.value)}
                    placeholder="Tags"
                  />
                  <input
                    className="auth-input"
                    type="number"
                    min={1}
                    step={1}
                    value={draft.width}
                    onChange={(event) => updateDraft(item.relativeUrl, 'width', event.target.value)}
                    placeholder="Display width (px)"
                  />
                  <input
                    className="auth-input"
                    type="number"
                    min={1}
                    step={1}
                    value={draft.height}
                    onChange={(event) => updateDraft(item.relativeUrl, 'height', event.target.value)}
                    placeholder="Display height (px)"
                  />
                  <button type="button" className="mini-btn" onClick={() => saveMetadata(item)} disabled={savingKey === item.relativeUrl}>
                    {savingKey === item.relativeUrl ? 'Saving...' : 'Save'}
                  </button>
                </div>
                <p className="media-card__url">{item.url}</p>
                <div className="media-card__actions">
                  <button type="button" className="mini-btn" onClick={() => copyUrl(item.url)}>Copy URL</button>
                  {pickMode ? (
                    <button type="button" className="mini-btn" onClick={() => insertIntoEditor(item)}>Insert</button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
