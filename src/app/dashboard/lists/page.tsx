'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

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
  const [selectedList, setSelectedList] = useState<ListDetail | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsPagination, setContactsPagination] = useState<Pagination>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
    search: '',
    sort: 'createdAt',
    order: 'desc',
  });
  const [message, setMessage] = useState('');
  const [listSearch, setListSearch] = useState('');
  const [listSearchDraft, setListSearchDraft] = useState('');
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(8);
  const [listSort, setListSort] = useState('createdAt');
  const [listOrder, setListOrder] = useState<'asc' | 'desc'>('desc');
  const [contactSearch, setContactSearch] = useState('');
  const [contactSearchDraft, setContactSearchDraft] = useState('');
  const [contactPage, setContactPage] = useState(1);
  const [contactPageSize, setContactPageSize] = useState(10);
  const [contactSort, setContactSort] = useState('createdAt');
  const [contactOrder, setContactOrder] = useState<'asc' | 'desc'>('desc');
  const [activeMenuId, setActiveMenuId] = useState('');
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactFirstName, setContactFirstName] = useState('');
  const [contactLastName, setContactLastName] = useState('');
  const [csvText, setCsvText] = useState('');

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

  async function loadSelectedList(listId: string) {
    if (!listId) {
      setSelectedList(null);
      return;
    }

    const response = await fetch(`/api/lists/${listId}`, { cache: 'no-store' });
    if (!response.ok) {
      setSelectedList(null);
      return;
    }

    const data = (await response.json()) as { list: ListDetail };
    setSelectedList(data.list || null);
  }

  async function loadContacts(listId: string) {
    if (!listId) {
      setContacts([]);
      setContactsPagination((current) => ({ ...current, total: 0, totalPages: 1 }));
      return;
    }

    const params = new URLSearchParams({
      listId,
      page: String(contactPage),
      pageSize: String(contactPageSize),
      search: contactSearch,
      sort: contactSort,
      order: contactOrder,
    });
    const response = await fetch(`/api/contacts?${params.toString()}`, { cache: 'no-store' });
    const data = (await response.json()) as ContactsResponse;
    setContacts(data.contacts || []);
    setContactsPagination(data.pagination || contactsPagination);
  }

  useEffect(() => {
    loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listPage, listPageSize, listSearch, listSort, listOrder]);

  useEffect(() => {
    if (!selectedListId && lists.length > 0) {
      setSelectedListId(lists[0].id);
    }
  }, [lists, selectedListId]);

  useEffect(() => {
    loadSelectedList(selectedListId);
    setContactPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedListId]);

  useEffect(() => {
    loadContacts(selectedListId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedListId, contactPage, contactPageSize, contactSearch, contactSort, contactOrder]);

  async function refreshAll(nextSelectedListId = selectedListId) {
    await Promise.all([loadLists(), loadSelectedList(nextSelectedListId), loadContacts(nextSelectedListId)]);
  }

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
    const nextListId = data.list?.id || selectedListId;
    setSelectedListId(nextListId);
    await refreshAll(nextListId);
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
    await refreshAll();
  }

  async function deleteList(list: ListItem) {
    if (!confirm(`Delete list "${list.name}"?`)) return;

    const response = await fetch(`/api/lists/${list.id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Failed to delete list.');
      return;
    }

    if (selectedListId === list.id) {
      setSelectedListId('');
      setSelectedList(null);
      setContacts([]);
    }

    setMessage('List deleted.');
    await loadLists();
  }

  async function addContact(event: FormEvent) {
    event.preventDefault();
    if (!selectedListId) return;

    const response = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        listId: selectedListId,
        email: contactEmail,
        firstName: contactFirstName,
        lastName: contactLastName,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Failed to add contact.');
      return;
    }

    setContactEmail('');
    setContactFirstName('');
    setContactLastName('');
    setMessage('Contact added.');
    await refreshAll();
  }

  async function importCsv(event: FormEvent) {
    event.preventDefault();
    if (!selectedListId) return;

    const response = await fetch('/api/contacts', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ listId: selectedListId, csv: csvText }),
    });

    const data = (await response.json()) as { created?: number; skipped?: number; error?: string };

    if (!response.ok) {
      setMessage(data.error || 'Import failed.');
      return;
    }

    setMessage(`Import complete. Created: ${data.created ?? 0}, Skipped: ${data.skipped ?? 0}.`);
    setCsvText('');
    await refreshAll();
  }

  async function updateContactStatus(contactId: string, status: string) {
    const response = await fetch(`/api/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Failed to update contact status.');
      return;
    }

    setMessage('Contact status updated.');
    await refreshAll();
  }

  async function deleteContact(contactId: string) {
    const response = await fetch(`/api/contacts/${contactId}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Failed to delete contact.');
      return;
    }

    setMessage('Contact deleted.');
    await refreshAll();
  }

  const selectedListSummary = useMemo(
    () => selectedList || lists.find((item) => item.id === selectedListId) || null,
    [lists, selectedList, selectedListId],
  );

  const listTotal = listsPagination.total;
  const listCountOnPage = lists.length;
  const contactsTotal = contactsPagination.total;

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
          <h3>Selected Contacts</h3>
          <p className="stat-value">{selectedListSummary?.contactsCount ?? contactsTotal}</p>
        </div>
        <div className="stat-card">
          <h3>Selected Campaigns</h3>
          <p className="stat-value">{selectedListSummary?.campaignsCount ?? 0}</p>
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
                      <button className="link-btn" type="button" onClick={(event) => { event.stopPropagation(); setSelectedListId(list.id); }}>
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
                            <button type="button" onClick={() => setSelectedListId(list.id)}>Open</button>
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
          {selectedListSummary ? (
            <>
              <div className="section-header">
                <div>
                  <h2>{selectedListSummary.name}</h2>
                  <p>{selectedListSummary.description || 'No description yet.'}</p>
                </div>
                <div className="detail-actions">
                  <button className="mini-btn" type="button" onClick={() => updateList(selectedListSummary)}>Edit</button>
                  <button className="mini-btn danger" type="button" onClick={() => deleteList(selectedListSummary)}>Delete</button>
                </div>
              </div>

              <div className="detail-stats">
                <div>
                  <span>Contacts</span>
                  <strong>{selectedListSummary.contactsCount}</strong>
                </div>
                <div>
                  <span>Campaigns</span>
                  <strong>{selectedListSummary.campaignsCount}</strong>
                </div>
              </div>

              <div className="detail-panel">
                <h3>Add Contact</h3>
                <form className="auth-form" onSubmit={addContact}>
                  <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="email@example.com" type="email" required />
                  <input value={contactFirstName} onChange={(e) => setContactFirstName(e.target.value)} placeholder="First name" />
                  <input value={contactLastName} onChange={(e) => setContactLastName(e.target.value)} placeholder="Last name" />
                  <button className="btn-primary" type="submit">Add Contact</button>
                </form>
              </div>

              <div className="detail-panel">
                <h3>Import CSV</h3>
                <p>Format: `email,firstName,lastName` (header optional)</p>
                <form className="auth-form" onSubmit={importCsv}>
                  <textarea
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder={'email,firstName,lastName\nuser1@example.com,Jane,Doe'}
                    rows={6}
                    className="auth-textarea"
                  />
                  <button className="btn-primary" type="submit">Import Contacts</button>
                </form>
              </div>

              <div className="detail-panel">
                <div className="section-header section-header--compact">
                  <h3>Contacts</h3>
                  <PaginationControls
                    pagination={contactsPagination}
                    onPrevious={() => setContactPage((current) => Math.max(1, current - 1))}
                    onNext={() => setContactPage((current) => Math.min(contactsPagination.totalPages, current + 1))}
                  />
                </div>

                <div className="list-toolbar list-toolbar--compact">
                  <form
                    className="list-toolbar__search"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setContactPage(1);
                      setContactSearch(contactSearchDraft.trim());
                    }}
                  >
                    <input
                      name="contactSearch"
                      value={contactSearchDraft}
                      onChange={(e) => setContactSearchDraft(e.target.value)}
                      placeholder="Search contacts"
                    />
                    <button className="btn-secondary" type="submit">Search</button>
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => {
                        setContactSearch('');
                        setContactSearchDraft('');
                        setContactPage(1);
                      }}
                    >
                      Clear
                    </button>
                  </form>

                  <div className="list-toolbar__filters">
                    <select value={contactSort} onChange={(e) => setContactSort(e.target.value)} className="status-select">
                      <option value="createdAt">Created</option>
                      <option value="email">Email</option>
                      <option value="status">Status</option>
                      <option value="firstName">First name</option>
                      <option value="lastName">Last name</option>
                    </select>
                    <select value={contactOrder} onChange={(e) => setContactOrder(e.target.value as 'asc' | 'desc')} className="status-select">
                      <option value="desc">Newest first</option>
                      <option value="asc">Oldest first</option>
                    </select>
                    <select value={contactPageSize} onChange={(e) => setContactPageSize(Number(e.target.value))} className="status-select">
                      <option value={10}>10 / page</option>
                      <option value={20}>20 / page</option>
                      <option value={40}>40 / page</option>
                    </select>
                  </div>
                </div>

                <div className="detail-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.length === 0 ? (
                        <tr><td colSpan={4}>No contacts for selected list.</td></tr>
                      ) : (
                        contacts.map((contact) => (
                          <tr key={contact.id}>
                            <td>{contact.email}</td>
                            <td>{[contact.firstName, contact.lastName].filter(Boolean).join(' ') || '-'}</td>
                            <td>{contact.status}</td>
                            <td>
                              <select
                                value={contact.status}
                                onChange={(e) => updateContactStatus(contact.id, e.target.value)}
                                className="status-select"
                              >
                                <option value="SUBSCRIBED">SUBSCRIBED</option>
                                <option value="UNSUBSCRIBED">UNSUBSCRIBED</option>
                                <option value="BOUNCED">BOUNCED</option>
                              </select>
                              <button className="mini-btn danger" type="button" onClick={() => deleteContact(contact.id)}>Delete</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="detail-empty">
              <h2>Select a list</h2>
              <p>Choose a list from the table to manage its contacts, imports, and actions here.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
