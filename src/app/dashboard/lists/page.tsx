'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type ListItem = {
  id: string;
  name: string;
  description: string | null;
  contactsCount: number;
  campaignsCount: number;
  createdAt?: string;
  updatedAt?: string;
};

type ListDetail = ListItem & {
  userId: string;
};

type Contact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  listId?: string;
  listName?: string;
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

type ContactsResponse = {
  contacts: Contact[];
  pagination: Pagination;
};

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

export default function ListsPage() {
  const router = useRouter();
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
  const [message, setMessage] = useState('');
  const [listSearch, setListSearch] = useState('');
  const [listSearchDraft, setListSearchDraft] = useState('');
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(8);
  const [listSort, setListSort] = useState('createdAt');
  const [listOrder, setListOrder] = useState<'asc' | 'desc'>('desc');
  const [activeMenuId, setActiveMenuId] = useState('');
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');

  async function loadLists() {
    const params = new URLSearchParams({
      page: String(listPage),
      pageSize: String(listPageSize),
      search: listSearch,
      sort: listSort,
      order: listOrder,
    });
    const response = await fetch(`/api/lists?${params.toString()}`, { cache: 'no-store' });
    const data = (await response.json()) as ListResponse;
    const nextLists = data.lists || [];
    setLists(nextLists);
    setListsPagination(data.pagination || listsPagination);
    setActiveMenuId('');

    if (!selectedListId && nextLists.length) {
      setSelectedListId(nextLists[0].id);
    }
  }

  useEffect(() => {
    loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listPage, listPageSize, listSearch, listSort, listOrder]);

  async function createList(event: FormEvent) {
    event.preventDefault();
    setMessage('');

    const response = await fetch('/api/lists', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: newListName, description: newListDescription }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Failed to create list.');
      return;
    }

    setNewListName('');
    setNewListDescription('');
    setMessage('List created.');
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

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Failed to update list.');
      return;
    }

    setMessage('List updated.');
    await loadLists();
  }

  async function deleteList(list: ListItem) {
    if (!confirm(`Delete list "${list.name}"?`)) return;

    const response = await fetch(`/api/lists/${list.id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Failed to delete list.');
      return;
    }

    setMessage('List deleted.');
    await loadLists();
  }


  const listTotal = listsPagination.total;
  const listCountOnPage = lists.length;

  return (
    <div className="overview">
      <header className="page-header">
        <h1>Lists</h1>
        <p>Search, segment, and manage subscribers with a split master-detail layout.</p>
      </header>

      {message ? <p className="form-note">{message}</p> : null}

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card">
          <h3>Total Lists</h3>
          <p className="stat-value">{listTotal}</p>
        </div>
        <div className="stat-card">
          <h3>Visible</h3>
          <p className="stat-value">{listCountOnPage}</p>
        </div>
        <div className="stat-card">
          <h3>Detail Pages</h3>
          <p className="stat-value">{listTotal}</p>
        </div>
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2>Create List</h2>
        <form className="list-create-form" onSubmit={createList}>
          <input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="List name" required />
          <input value={newListDescription} onChange={(e) => setNewListDescription(e.target.value)} placeholder="Description" />
          <button className="btn-primary" type="submit">Create</button>
        </form>
      </div>

      <div className="lists-master-detail">
        <section className="card lists-master">
          <div className="section-header">
            <div>
              <h2>All Lists</h2>
              <p>Pick a list to manage its contacts and actions in the panel on the right.</p>
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

          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Contacts</th>
                <th>Campaigns</th>
                <th>Row</th>
              </tr>
            </thead>
            <tbody>
              {lists.length === 0 ? (
                <tr><td colSpan={5}>No lists yet.</td></tr>
              ) : (
                lists.map((list) => (
                  <tr
                    key={list.id}
                    className={selectedListId === list.id ? 'is-selected-row' : ''}
                    onClick={() => setSelectedListId(list.id)}
                  >
                    <td>
                      <button className="link-btn" type="button" onClick={(event) => { event.stopPropagation(); router.push(`/dashboard/lists/${list.id}`); }}>
                        {list.name}
                      </button>
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
                            <button type="button" onClick={() => updateList(list)}>Edit</button>
                            <button type="button" className="danger" onClick={() => deleteList(list)}>Delete</button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
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
                  <p>Move into a dedicated page for the contacts, imports, and list actions.</p>
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
                  <span>Current page</span>
                  <strong>{listPage}</strong>
                </div>
              </div>

              <p className="form-note">The full contact manager is now on the list detail page for a cleaner workflow.</p>
            </>
          ) : (
            <div className="detail-empty">
              <h2>Select a list</h2>
              <p>Choose a list from the table to open its detail page.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
