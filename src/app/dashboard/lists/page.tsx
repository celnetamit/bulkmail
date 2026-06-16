'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconHelp, IconImport, IconPlus } from '@/components/dashboard-icons';
import { ListDeleteModal } from '@/components/list-delete-modal';
import { useToast } from '@/components/toast-provider';

type ListItem = {
  id: string;
  name: string;
  description: string | null;
  isDefaultTestList?: number | boolean;
  isArchived?: number | boolean;
  contactsCount: number;
  campaignsCount: number;
  createdAt?: string;
  updatedAt?: string;
  userId?: string;
  owner?: { id: string; email: string; name: string | null; role: string };
  isOwner?: boolean;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  search: string;
  sort: string;
  order: 'asc' | 'desc';
};

type ListResponse = {
  lists: ListItem[];
  pagination: Pagination;
};

type BulkListResponse = {
  error?: string;
  success?: boolean;
  action?: string;
  listIds?: string[];
  createdListIds?: string[];
  lists?: ListItem[];
  code?: string;
  campaignCount?: number;
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

async function readResponseMessage(response: Response, fallback: string) {
  const data = (await readJsonResponse<{ error?: string }>(response)) || null;
  if (response.ok) return data;
  return { error: data?.error || fallback };
}

function formatRange(page: number, pageSize: number, total: number) {
  if (total === 0) return '0';
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return `${start}-${end} of ${total}`;
}

function PaginationControls({
  pagination,
  onPrevious,
  onNext,
}: {
  pagination: Pagination;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="pagination-controls">
      <span>{formatRange(pagination.page, pagination.pageSize, pagination.total)}</span>
      <div className="pagination-actions">
        <button className="mini-btn" type="button" onClick={onPrevious} disabled={pagination.page <= 1}>
          Prev
        </button>
        <button className="mini-btn" type="button" onClick={onNext} disabled={pagination.page >= pagination.totalPages}>
          Next
        </button>
      </div>
    </div>
  );
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

export default function ListsPage() {
  const router = useRouter();
  const toast = useToast();
  const listImportRef = useRef<HTMLInputElement | null>(null);
  const [lists, setLists] = useState<ListItem[]>([]);
  const [listsPagination, setListsPagination] = useState<Pagination>({
    page: 1,
    pageSize: 8,
    total: 0,
    totalPages: 1,
    search: '',
    sort: 'createdAt',
    order: 'desc',
  });
  const [selectedListId, setSelectedListId] = useState('');
  const [listSearch, setListSearch] = useState('');
  const [listSearchDraft, setListSearchDraft] = useState('');
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(8);
  const [listSort, setListSort] = useState('createdAt');
  const [listOrder, setListOrder] = useState<'asc' | 'desc'>('desc');
  const [activeMenuId, setActiveMenuId] = useState('');
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [newListIsDefaultTestList, setNewListIsDefaultTestList] = useState(false);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function loadLists() {
    const params = new URLSearchParams({
      page: String(listPage),
      pageSize: String(listPageSize),
      search: listSearch,
      sort: listSort,
      order: listOrder,
    });
    if (showArchived) {
      params.set('includeArchived', 'true');
    }
    const response = await fetch(`/api/lists?${params.toString()}`, { cache: 'no-store' });
    const data = (await readJsonResponse<ListResponse & { error?: string }>(response)) || null;
    if (!response.ok) {
      toast.error('List load failed', data?.error || 'The list index could not be loaded.');
      return;
    }

    if (!data) {
      toast.error('List load failed', 'The list index returned no usable data.');
      return;
    }
    const nextLists = data.lists || [];
    setLists(nextLists);
    setListsPagination(data.pagination || listsPagination);
    setActiveMenuId('');
    setSelectedListIds([]);
    if (nextLists.length) {
      const stillVisible = nextLists.some((list) => list.id === selectedListId);
      if (!stillVisible) {
        setSelectedListId(nextLists[0].id);
      }
    } else {
      setSelectedListId('');
    }
  }

  useEffect(() => {
    loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listPage, listPageSize, listSearch, listSort, listOrder, showArchived]);

  async function createList(event: FormEvent) {
    event.preventDefault();

    const response = await fetch('/api/lists', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: newListName,
        description: newListDescription,
        isDefaultTestList: newListIsDefaultTestList,
      }),
    });

    const data = (await readJsonResponse<{ error?: string; list?: ListItem }>(response)) || {};
    if (!response.ok) {
      toast.error('List creation failed', data?.error || 'The new list could not be created.');
      return;
    }

    setNewListName('');
    setNewListDescription('');
    setNewListIsDefaultTestList(false);
    toast.success('List created', 'The new list is ready.');
    await loadLists();
    if (data.list?.id) {
      router.push(`/dashboard/lists/${data.list.id}`);
    }
  }

  async function updateList(list: ListItem) {
    const name = prompt('List name', list.name);
    if (!name) return;
    const description = prompt('Description', list.description || '') || '';

    const response = await fetch(`/api/lists/${list.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });

    const data = await readResponseMessage(response, 'Failed to update list.');
    if (!response.ok) {
      toast.error('List update failed', data?.error || 'The list could not be updated.');
      return;
    }

    toast.success('List updated', 'The list changes were saved.');
    await loadLists();
  }

  async function deleteList(list: ListItem) {
    setDeleteTarget(list);
  }

  async function confirmDeleteList(forceDelete: boolean) {
    if (!deleteTarget) return;

    setDeleteBusy(true);
    const response = await fetch(`/api/lists/${deleteTarget.id}${forceDelete ? '?force=true' : ''}`, { method: 'DELETE' });
    const data = (await readJsonResponse<BulkListResponse>(response)) || {};

    if (!response.ok) {
      setDeleteBusy(false);
      if (!forceDelete && response.status === 409 && data.code === 'list_in_use' && typeof data.campaignCount === 'number' && data.campaignCount > 0) {
        setDeleteTarget((current) => (current ? { ...current, campaignsCount: data.campaignCount || 0 } : current));
        return;
      }

      toast.error('List delete failed', data.error || 'The list could not be deleted.');
      return;
    }

    setDeleteBusy(false);
    setDeleteTarget(null);
    toast.success('List deleted', 'The list was removed.');
    await loadLists();
  }

  async function archiveLists(listIds: string[], archived: boolean) {
    if (listIds.length === 0) return;
    setBulkLoading(true);

    const response = await fetch('/api/lists/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: archived ? 'archive' : 'unarchive', listIds }),
    });

    const data = (await readJsonResponse<BulkListResponse>(response)) || {};
    setBulkLoading(false);
    if (!response.ok) {
      toast.error(
        archived ? 'List archive failed' : 'List restore failed',
        data?.error || `The selected lists could not be ${archived ? 'archived' : 'restored'}.`,
      );
      return;
    }

    setSelectedListIds([]);
    toast.success(
      archived ? 'Lists archived' : 'Lists restored',
      `${listIds.length} list${listIds.length === 1 ? '' : 's'} ${archived ? 'archived' : 'restored'}.`,
    );
    await loadLists();
  }

  async function duplicateLists(listIds: string[]) {
    if (listIds.length === 0) return;
    setBulkLoading(true);

    const response = await fetch('/api/lists/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'duplicate', listIds }),
    });

    const data = (await readJsonResponse<BulkListResponse>(response)) || {};
    setBulkLoading(false);
    if (!response.ok) {
      toast.error('List duplicate failed', data?.error || 'The selected lists could not be duplicated.');
      return;
    }

    setSelectedListIds([]);
    toast.success(
      'Lists duplicated',
      `${data.createdListIds?.length || listIds.length} list${(data.createdListIds?.length || listIds.length) === 1 ? '' : 's'} duplicated.`,
    );
    await loadLists();
  }

  async function exportLists(listIds: string[]) {
    if (listIds.length === 0) return;
    const response = await fetch(`/api/lists/export?listIds=${encodeURIComponent(listIds.join(','))}`, { cache: 'no-store' });
    const data = (await readJsonResponse<Record<string, unknown>>(response)) || null;
    if (!response.ok) {
      toast.error('List export failed', (data?.error as string) || 'The selected lists could not be exported.');
      return;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `lists-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success('Lists exported', `Exported ${listIds.length} list${listIds.length === 1 ? '' : 's'}.`);
  }

  async function importLists(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBulkLoading(true);
    setImportStatus('Reading file...');
    await yieldToBrowser();

    try {
      const fileContents = await file.text();
      setImportStatus('Uploading file...');
      await yieldToBrowser();

      const responsePromise = fetch('/api/lists/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: fileContents,
      });

      setImportStatus('Processing import...');
      await yieldToBrowser();

      const response = await responsePromise;
      const data = (await readJsonResponse<BulkListResponse>(response)) || {};

      if (!response.ok) {
        toast.error('List import failed', data?.error || 'The lists could not be imported.');
        return;
      }

      toast.success('Lists imported', `Imported ${data.createdListIds?.length || 0} list${(data.createdListIds?.length || 0) === 1 ? '' : 's'}.`);
      await loadLists();
    } catch {
      toast.error('Import failed', 'The list import could not be completed.');
    } finally {
      setBulkLoading(false);
      setImportStatus('');
    }
  }

  function toggleSelectedList(id: string) {
    const list = lists.find((entry) => entry.id === id);
    if (list && list.isOwner === false) return;
    setSelectedListIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  function toggleSelectAllVisible() {
    if (lists.length === 0) return;
    const visibleIds = lists.filter((list) => list.isOwner !== false).map((list) => list.id);
    const allSelected = visibleIds.every((id) => selectedListIds.includes(id));
    setSelectedListIds(allSelected ? [] : visibleIds);
  }

  const listTotal = listsPagination.total;
  const listCountOnPage = lists.length;
  const selectedListCount = selectedListIds.length;
  const selectableLists = lists.filter((list) => list.isOwner !== false);
  const allVisibleSelected = selectableLists.length > 0 && selectableLists.every((list) => selectedListIds.includes(list.id));

  return (
    <div className="overview">
      <ListDeleteModal
        open={deleteTarget !== null}
        listName={deleteTarget?.name || ''}
        contactCount={deleteTarget?.contactsCount || 0}
        campaignCount={deleteTarget?.campaignsCount || 0}
        busy={deleteBusy}
        onClose={() => {
          if (deleteBusy) return;
          setDeleteTarget(null);
        }}
        onDelete={confirmDeleteList}
      />

      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h1>Lists</h1>
            <p>Keep list browsing light, then jump into a dedicated page when you need to work contacts and imports.</p>
          </div>
          <div className="header-actions header-actions--stacked">
            <div className="header-actions__buttons">
              <button className="btn-secondary btn-secondary--with-icon" type="button" onClick={() => router.push('/dashboard/lists#create-list')}>
                <IconPlus className="btn-icon" aria-hidden="true" />
                New list
              </button>
              <button className="btn-secondary btn-secondary--with-icon" type="button" onClick={() => listImportRef.current?.click()} disabled={bulkLoading || Boolean(importStatus)}>
                <IconImport className="btn-icon" aria-hidden="true" />
                Import
              </button>
              <button className="btn-secondary btn-secondary--with-icon" type="button" onClick={() => router.push('/dashboard/help')}>
                <IconHelp className="btn-icon" aria-hidden="true" />
                Help
              </button>
            </div>
            <p className="form-note header-actions__status" aria-live="polite">
              {importStatus || '\u00a0'}
            </p>
          </div>
        </div>
      </header>
      <div className="stats-grid dashboard-stats">
        <div className="stat-card">
          <h3>Total Lists</h3>
          <p className="stat-value">{listTotal}</p>
        </div>
        <div className="stat-card">
          <h3>Visible</h3>
          <p className="stat-value">{listCountOnPage}</p>
        </div>
        <div className="stat-card">
          <h3>Workspace</h3>
          <p className="stat-value">{listTotal}</p>
        </div>
      </div>

      <input
        ref={listImportRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={importLists}
      />

      <div id="create-list" className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2>Create List</h2>
        <form className="list-create-form" onSubmit={createList}>
          <input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="List name" required />
          <input value={newListDescription} onChange={(e) => setNewListDescription(e.target.value)} placeholder="Description" />
          <label className="inline-toggle">
            <input
              type="checkbox"
              checked={newListIsDefaultTestList}
              onChange={(e) => setNewListIsDefaultTestList(e.target.checked)}
            />
            <span>Default test list</span>
          </label>
          <button className="btn-primary" type="submit">Create</button>
        </form>
      </div>

      <div className="lists-master-detail">
        <section className="card lists-master">
          <div className="section-header">
            <div>
              <h2>All Lists</h2>
              <p>Browse the archive here. Open a list to work the full contact view.</p>
            </div>
            <PaginationControls
              pagination={listsPagination}
              onPrevious={() => setListPage((current) => Math.max(1, current - 1))}
              onNext={() => setListPage((current) => Math.min(listsPagination.totalPages, current + 1))}
            />
          </div>

          <div className="list-toolbar">
              <form
                className="list-toolbar__search"
                onSubmit={(event) => {
                  event.preventDefault();
                  setListPage(1);
                  setListSearch(listSearchDraft.trim());
                }}
              >
                <input
                  name="listSearch"
                  value={listSearchDraft}
                  onChange={(e) => setListSearchDraft(e.target.value)}
                  placeholder="Search lists"
                />
                <button className="btn-secondary" type="submit">Search</button>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    setListSearch('');
                    setListSearchDraft('');
                    setListPage(1);
                  }}
                >
                  Clear
              </button>
            </form>

            <div className="list-toolbar__filters">
              <label className="inline-toggle">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                <span>Show archived</span>
              </label>
              <select value={listSort} onChange={(e) => setListSort(e.target.value)} className="status-select">
                <option value="createdAt">Created</option>
                <option value="name">Name</option>
                <option value="contactsCount">Contacts</option>
                <option value="campaignsCount">Campaigns</option>
              </select>
              <select value={listOrder} onChange={(e) => setListOrder(e.target.value as 'asc' | 'desc')} className="status-select">
                <option value="desc">Newest first</option>
                <option value="asc">Oldest first</option>
              </select>
              <select value={listPageSize} onChange={(e) => setListPageSize(Number(e.target.value))} className="status-select">
                <option value={8}>8 / page</option>
                <option value={12}>12 / page</option>
                <option value={20}>20 / page</option>
              </select>
            </div>
          </div>

          {selectedListCount > 0 ? (
            <div className="bulk-action-bar">
              <div className="bulk-action-bar__summary">
                <strong>{selectedListCount}</strong> selected
              </div>
              <div className="bulk-action-bar__actions">
                <button className="mini-btn" type="button" onClick={() => archiveLists(selectedListIds, true)} disabled={bulkLoading}>
                  Archive
                </button>
                <button className="mini-btn" type="button" onClick={() => archiveLists(selectedListIds, false)} disabled={bulkLoading}>
                  Unarchive
                </button>
                <button className="mini-btn" type="button" onClick={() => duplicateLists(selectedListIds)} disabled={bulkLoading}>
                  Duplicate
                </button>
                <button className="mini-btn" type="button" onClick={() => exportLists(selectedListIds)} disabled={bulkLoading}>
                  Export
                </button>
                <button className="mini-btn danger" type="button" onClick={() => setSelectedListIds([])} disabled={bulkLoading}>
                  Clear
                </button>
              </div>
            </div>
          ) : null}

          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    aria-label="Select all visible lists"
                  />
                </th>
                <th>Name</th>
                <th>Description</th>
                <th>Contacts</th>
                <th>Campaigns</th>
                <th>Row</th>
              </tr>
            </thead>
            <tbody>
              {lists.length === 0 ? (
                <tr><td colSpan={6}>No lists yet.</td></tr>
              ) : (
                lists.map((list) => {
                  const canManageList = list.isOwner !== false;
                  return (
                  <tr
                    key={list.id}
                    className={`${selectedListId === list.id ? 'is-selected-row' : ''} ${selectedListIds.includes(list.id) ? 'is-selected-row--bulk' : ''}`}
                    onClick={() => setSelectedListId(list.id)}
                    >
                      <td onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedListIds.includes(list.id)}
                          onChange={() => toggleSelectedList(list.id)}
                          disabled={!canManageList}
                          aria-label={`Select list ${list.name}`}
                        />
                      </td>
                      <td>
                        <button className="link-btn" type="button" onClick={(event) => { event.stopPropagation(); router.push(`/dashboard/lists/${list.id}`); }}>
                          {list.name}
                        </button>
                        {list.owner ? (
                          <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: '#64748b' }}>
                            Owner: {list.owner.name || list.owner.email} ({list.owner.role})
                          </div>
                        ) : null}
                        {list.isDefaultTestList ? <div className="badge badge-success" style={{ display: 'inline-flex', marginTop: '0.35rem' }}>Default test list</div> : null}
                        {list.isArchived ? <div className="badge badge-warning" style={{ display: 'inline-flex', marginTop: '0.35rem' }}>Archived</div> : null}
                        {!canManageList ? <div className="badge badge-info" style={{ display: 'inline-flex', marginTop: '0.35rem' }}>Read-only</div> : null}
                      </td>
                    <td>{list.description || '-'}</td>
                    <td>{list.contactsCount}</td>
                    <td>{list.campaignsCount}</td>
                    <td>
                      <div className="row-menu-trigger">
                        <button
                          className="mini-btn"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setActiveMenuId((current) => (current === list.id ? '' : list.id));
                          }}
                        >
                          More
                        </button>
                        {activeMenuId === list.id ? (
                          <div className="row-menu" onClick={(event) => event.stopPropagation()}>
                            <button type="button" onClick={() => router.push(`/dashboard/lists/${list.id}`)}>Open</button>
                            <button type="button" onClick={() => updateList(list)} disabled={!canManageList}>Edit</button>
                            <button type="button" onClick={() => archiveLists([list.id], !Boolean(list.isArchived))} disabled={!canManageList}>
                              {list.isArchived ? 'Unarchive' : 'Archive'}
                            </button>
                            <button type="button" onClick={() => duplicateLists([list.id])} disabled={!canManageList}>Duplicate</button>
                            <button type="button" className="danger" onClick={() => deleteList(list)} disabled={!canManageList}>Delete</button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>

        <aside className="card lists-detail">
          {selectedListId ? (
            <>
              <div className="section-header">
                <div>
                  <h2>Open list workspace</h2>
                  <p>Contacts, imports, editing, and bulk work all live on the detail page.</p>
                </div>
                <div className="detail-actions">
                  <button className="mini-btn" type="button" onClick={() => router.push(`/dashboard/lists/${selectedListId}`)}>Open page</button>
                </div>
              </div>

              <div className="detail-stats">
                <div>
                  <span>Selected list</span>
                  <strong>{selectedListId.slice(0, 8)}</strong>
                </div>
                <div>
                  <span>Working mode</span>
                  <strong>Detail</strong>
                </div>
              </div>

              <p className="form-note">The page stays deliberately narrow so the list table doesn’t turn into a control dump.</p>
            </>
          ) : (
            <div className="detail-empty">
              <h2>Select a list</h2>
              <p>Choose a list from the table to open its dedicated workspace.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
