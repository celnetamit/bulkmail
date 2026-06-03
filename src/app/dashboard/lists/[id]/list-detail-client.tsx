'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';

type ListDetail = {
  id: string;
  name: string;
  description: string | null;
  userId: string;
  isDefaultTestList: number | boolean;
  contactsCount: number;
  campaignsCount: number;
  owner?: { id: string; email: string; name: string | null; role: string };
  isOwner?: boolean;
};

type Contact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
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

export function ListDetailClient({ listId }: { listId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<ListDetail | null>(null);
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
  const [contactSearch, setContactSearch] = useState('');
  const [contactSearchDraft, setContactSearchDraft] = useState('');
  const [contactPage, setContactPage] = useState(1);
  const [contactPageSize, setContactPageSize] = useState(10);
  const [contactSort, setContactSort] = useState('createdAt');
  const [contactOrder, setContactOrder] = useState<'asc' | 'desc'>('desc');
  const [contactEmail, setContactEmail] = useState('');
  const [contactFirstName, setContactFirstName] = useState('');
  const [contactLastName, setContactLastName] = useState('');
  const [csvText, setCsvText] = useState('');

  async function loadList() {
    if (!listId) {
      setList(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const response = await fetch(`/api/lists/${listId}`, { cache: 'no-store' });
    if (!response.ok) {
      setList(null);
      setLoading(false);
      return;
    }

    const data = (await response.json()) as { list?: ListDetail };
    setList(data.list || null);
    setLoading(false);
  }

  async function loadContacts() {
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
    const data = (await response.json()) as { contacts?: Contact[]; pagination?: Pagination };
    setContacts(data.contacts || []);
    setContactsPagination(data.pagination || contactsPagination);
  }

  useEffect(() => {
    loadList();
    setContactPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

  useEffect(() => {
    loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId, contactPage, contactPageSize, contactSearch, contactSort, contactOrder]);

  async function refresh() {
    await Promise.all([loadList(), loadContacts()]);
  }

  async function updateList() {
    if (!list) return;
    if (list.isOwner === false) return setMessage('This list is read-only for your role.');

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
    await refresh();
  }

  async function makeDefaultTestList() {
    if (!list) return;
    if (list.isOwner === false) return setMessage('This list is read-only for your role.');

    const response = await fetch(`/api/lists/${list.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: list.name,
        description: list.description || '',
        isDefaultTestList: true,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Failed to set default test list.');
      return;
    }

    setMessage('Default test list updated.');
    await refresh();
  }

  async function deleteList() {
    if (!list) return;
    if (list.isOwner === false) return setMessage('This list is read-only for your role.');
    if (!confirm(`Delete list "${list.name}"?`)) return;

    const response = await fetch(`/api/lists/${list.id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Failed to delete list.');
      return;
    }

    setMessage('List deleted.');
    router.push('/dashboard/lists');
  }

  async function addContact(event: FormEvent) {
    event.preventDefault();
    if (!listId) return;
    if (list?.isOwner === false) return setMessage('This list is read-only for your role.');

    const response = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        listId,
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
    await refresh();
  }

  async function importCsv(event: FormEvent) {
    event.preventDefault();
    if (!listId) return;
    if (list?.isOwner === false) return setMessage('This list is read-only for your role.');

    const response = await fetch('/api/contacts', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ listId, csv: csvText }),
    });

    const data = (await response.json()) as { created?: number; skipped?: number; error?: string };

    if (!response.ok) {
      setMessage(data.error || 'Import failed.');
      return;
    }

    setMessage(`Import complete. Created: ${data.created ?? 0}, Skipped: ${data.skipped ?? 0}.`);
    setCsvText('');
    await refresh();
  }

  async function updateContactStatus(contactId: string, status: string) {
    if (list?.isOwner === false) return setMessage('This list is read-only for your role.');
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
    await refresh();
  }

  async function deleteContact(contactId: string) {
    if (list?.isOwner === false) return setMessage('This list is read-only for your role.');
    const response = await fetch(`/api/contacts/${contactId}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Failed to delete contact.');
      return;
    }

    setMessage('Contact deleted.');
    await refresh();
  }

  const contactCount = list?.contactsCount ?? contactsPagination.total;
  const campaignCount = list?.campaignsCount ?? 0;
  const canManageList = list?.isOwner !== false;

  return (
    <div className="overview">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h1>{loading ? 'Loading list...' : list?.name || 'List not found'}</h1>
            <p>{list?.description || 'Manage contacts, imports, and status updates from one focused page.'}</p>
            {list?.owner ? (
              <p className="form-note">
                Owner: {list.owner.name || list.owner.email} ({list.owner.role}){canManageList ? '' : ' - read-only'}
              </p>
            ) : null}
          </div>
          <Link className="btn-secondary" href="/dashboard/lists">Back to Lists</Link>
        </div>
      </header>

      {message ? <p className="form-note">{message}</p> : null}

      {list ? (
        <>
          <div className="stats-grid" style={{ marginBottom: '1rem' }}>
            <div className="stat-card">
              <h3>Contacts</h3>
              <p className="stat-value">{contactCount}</p>
            </div>
            <div className="stat-card">
              <h3>Campaigns</h3>
              <p className="stat-value">{campaignCount}</p>
            </div>
            <div className="stat-card">
              <h3>List ID</h3>
              <p className="stat-value" style={{ fontSize: '1rem' }}>{list.id.slice(0, 8)}</p>
            </div>
            <div className="stat-card">
              <h3>Workspace</h3>
              <p className="stat-value" style={{ fontSize: '1rem' }}>Detail page</p>
            </div>
          </div>

          <div className="detail-actions" style={{ marginBottom: '1rem' }}>
            {list.isDefaultTestList ? <span className="badge badge-success">Default test list</span> : null}
            {!canManageList ? <span className="badge badge-info">Read-only</span> : null}
            <button className="mini-btn" type="button" onClick={makeDefaultTestList} disabled={!canManageList || Boolean(list.isDefaultTestList)}>
              {list.isDefaultTestList ? 'Default list' : 'Set default test list'}
            </button>
            <button className="mini-btn" type="button" onClick={updateList} disabled={!canManageList}>Edit list</button>
            <button className="mini-btn danger" type="button" onClick={deleteList} disabled={!canManageList}>Delete list</button>
          </div>

          <div className="detail-panel">
            <h3>Add Contact</h3>
            <form className="auth-form" onSubmit={addContact}>
              <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="email@example.com" type="email" required />
              <input value={contactFirstName} onChange={(e) => setContactFirstName(e.target.value)} placeholder="First name" />
              <input value={contactLastName} onChange={(e) => setContactLastName(e.target.value)} placeholder="Last name" />
              <button className="btn-primary" type="submit" disabled={!canManageList}>Add Contact</button>
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
              <button className="btn-primary" type="submit" disabled={!canManageList}>Import Contacts</button>
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
                            disabled={!canManageList}
                          >
                            <option value="SUBSCRIBED">SUBSCRIBED</option>
                            <option value="UNSUBSCRIBED">UNSUBSCRIBED</option>
                            <option value="BOUNCED">BOUNCED</option>
                          </select>
                          <button className="mini-btn danger" type="button" onClick={() => deleteContact(contact.id)} disabled={!canManageList}>Delete</button>
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
        <div className="card" style={{ padding: '1rem' }}>
          <p className="form-note">This list could not be loaded. Go back to the lists page and try another record.</p>
        </div>
      )}
    </div>
  );
}
