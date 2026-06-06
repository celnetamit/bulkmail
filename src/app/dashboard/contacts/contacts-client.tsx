'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useToast } from '@/components/toast-provider';

type Contact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  listId: string;
  listName: string;
  ownerUserId?: string;
  ownerEmail?: string;
  ownerName?: string | null;
  ownerRole?: string;
  createdAt?: string;
  updatedAt?: string;
};

type ListOption = {
  id: string;
  name: string;
  isArchived?: number | boolean;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  search: string;
  sort: string;
  status: string;
  order: 'asc' | 'desc';
};

type ContactResponse = {
  contacts: Contact[];
  pagination: Pagination;
  scope?: string;
  error?: string;
};

type ListResponse = {
  lists?: ListOption[];
  error?: string;
};

type ContactDraft = {
  email: string;
  firstName: string;
  lastName: string;
  status: string;
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

const EMPTY_DRAFT: ContactDraft = {
  email: '',
  firstName: '',
  lastName: '',
  status: 'SUBSCRIBED',
};

export function ContactsClient() {
  const toast = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [lists, setLists] = useState<ListOption[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
    search: '',
    sort: 'createdAt',
    status: '',
    order: 'desc',
  });
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [listFilter, setListFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [draft, setDraft] = useState<ContactDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  async function loadLists() {
    const params = new URLSearchParams({
      all: 'true',
      sort: 'name',
      order: 'asc',
    });

    const response = await fetch(`/api/lists?${params.toString()}`, { cache: 'no-store' });
    const data = (await readJsonResponse<ListResponse>(response)) as ListResponse | null;
    if (!response.ok) {
      toast.error('List filter failed', data?.error || 'The list filter options could not be loaded.');
      return;
    }

    setLists(data?.lists || []);
  }

  async function loadContacts() {
    setLoading(true);

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      search,
      sort,
      order,
    });

    if (listFilter) params.set('listId', listFilter);
    if (statusFilter) params.set('status', statusFilter);

    const response = await fetch(`/api/contacts?${params.toString()}`, { cache: 'no-store' });
    const data = (await readJsonResponse<ContactResponse>(response)) as ContactResponse | null;

    if (!response.ok) {
      toast.error('Email load failed', data?.error || 'The email index could not be loaded.');
      setContacts([]);
      setPagination((current) => ({ ...current, total: 0, totalPages: 1 }));
      setLoading(false);
      return;
    }

    const nextContacts = data?.contacts || [];
    setContacts(nextContacts);
    setPagination(data?.pagination || pagination);

    const nextSelected = nextContacts.find((contact: Contact) => contact.id === selectedContactId) || nextContacts[0] || null;
    if (nextSelected) {
      setSelectedContactId(nextSelected.id);
      setDraft({
        email: nextSelected.email,
        firstName: nextSelected.firstName || '',
        lastName: nextSelected.lastName || '',
        status: nextSelected.status,
      });
    } else {
      setSelectedContactId('');
      setDraft(EMPTY_DRAFT);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, sort, order, listFilter, statusFilter]);

  function selectContact(contact: Contact) {
    setSelectedContactId(contact.id);
    setDraft({
      email: contact.email,
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      status: contact.status,
    });
  }

  async function saveContact(event: FormEvent) {
    event.preventDefault();
    if (!selectedContactId) return;

    setSaving(true);
    const response = await fetch(`/api/contacts/${selectedContactId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    });

    const data = (await readJsonResponse<{ error?: string }>(response)) || {};
    setSaving(false);

    if (!response.ok) {
      toast.error('Email update failed', data.error || 'The email record could not be updated.');
      return;
    }

    toast.success('Email updated', 'The contact record was saved.');
    await loadContacts();
  }

  const selectedContact = contacts.find((contact) => contact.id === selectedContactId) || null;

  return (
    <div className="overview">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h1>All Emails</h1>
            <p>Browse every contact you can access, filter the list, and edit the record without leaving the index.</p>
          </div>
          <div className="header-actions">
            <Link className="btn-secondary" href="/dashboard/lists">Lists</Link>
            <Link className="btn-secondary" href="/dashboard/help">Help</Link>
          </div>
        </div>
      </header>

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card">
          <h3>Matched Emails</h3>
          <p className="stat-value">{pagination.total.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <h3>Visible Page</h3>
          <p className="stat-value">{formatRange(pagination.page, pagination.pageSize, pagination.total)}</p>
        </div>
        <div className="stat-card">
          <h3>Active Filters</h3>
          <p className="stat-value" style={{ fontSize: '1rem' }}>
            {[search ? 'Search' : null, listFilter ? 'List' : null, statusFilter ? 'Status' : null].filter(Boolean).join(' • ') || 'None'}
          </p>
        </div>
        <div className="stat-card">
          <h3>Selected</h3>
          <p className="stat-value" style={{ fontSize: '1rem' }}>{selectedContact ? selectedContact.email : 'None'}</p>
        </div>
      </div>

      <div className="detail-panel" style={{ marginBottom: '1rem' }}>
        <div className="section-header section-header--compact">
          <h3>Filters</h3>
          <PaginationControls
            pagination={pagination}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
          />
        </div>

        <div className="list-toolbar list-toolbar--compact">
          <form
            className="list-toolbar__search"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSearch(searchDraft.trim());
            }}
          >
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search email or name"
            />
            <button className="btn-secondary" type="submit">Search</button>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => {
                setSearch('');
                setSearchDraft('');
                setListFilter('');
                setStatusFilter('');
                setPage(1);
              }}
            >
              Clear
            </button>
          </form>

          <div className="list-toolbar__filters">
            <select
              className="status-select"
              value={listFilter}
              onChange={(event) => {
                setPage(1);
                setListFilter(event.target.value);
              }}
            >
              <option value="">All lists</option>
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
            <select
              className="status-select"
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value);
              }}
            >
              <option value="">All statuses</option>
              <option value="SUBSCRIBED">SUBSCRIBED</option>
              <option value="UNSUBSCRIBED">UNSUBSCRIBED</option>
              <option value="BOUNCED">BOUNCED</option>
            </select>
            <select
              className="status-select"
              value={sort}
              onChange={(event) => {
                setPage(1);
                setSort(event.target.value);
              }}
            >
              <option value="createdAt">Created</option>
              <option value="updatedAt">Updated</option>
              <option value="email">Email</option>
              <option value="status">Status</option>
              <option value="firstName">First name</option>
              <option value="lastName">Last name</option>
              <option value="listName">List name</option>
            </select>
            <select
              className="status-select"
              value={order}
              onChange={(event) => {
                setPage(1);
                setOrder(event.target.value as 'asc' | 'desc');
              }}
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
            <select
              className="status-select"
              value={pageSize}
              onChange={(event) => {
                setPage(1);
                setPageSize(Number(event.target.value));
              }}
            >
              <option value={20}>20 / page</option>
              <option value={40}>40 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
        </div>
      </div>

      <div className="detail-panel" style={{ marginBottom: '1rem' }}>
        <div className="section-header section-header--compact">
          <h3>Edit Email</h3>
          <span className="form-note">{selectedContact ? `Editing ${selectedContact.email}` : 'Select a row to start editing.'}</span>
        </div>

        {selectedContact ? (
          <form className="auth-form" onSubmit={saveContact}>
            <div className="form-note">
              List: <strong>{selectedContact.listName}</strong>
            </div>
            <input
              type="email"
              value={draft.email}
              onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
              placeholder="email@example.com"
              required
            />
            <input
              value={draft.firstName}
              onChange={(event) => setDraft((current) => ({ ...current, firstName: event.target.value }))}
              placeholder="First name"
            />
            <input
              value={draft.lastName}
              onChange={(event) => setDraft((current) => ({ ...current, lastName: event.target.value }))}
              placeholder="Last name"
            />
            <select
              className="status-select"
              value={draft.status}
              onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="SUBSCRIBED">SUBSCRIBED</option>
              <option value="UNSUBSCRIBED">UNSUBSCRIBED</option>
              <option value="BOUNCED">BOUNCED</option>
            </select>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  if (selectedContact) selectContact(selectedContact);
                }}
              >
                Reset
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  setSelectedContactId('');
                  setDraft(EMPTY_DRAFT);
                }}
              >
                Close
              </button>
            </div>
          </form>
        ) : (
          <p className="form-note">Pick any email from the table below to edit it here.</p>
        )}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>List</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>Loading emails...</td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={6}>No emails matched your filters.</td>
                </tr>
              ) : (
                contacts.map((contact) => (
                  <tr key={contact.id} style={contact.id === selectedContactId ? { background: 'rgba(59, 130, 246, 0.08)' } : undefined}>
                    <td>{contact.email}</td>
                    <td>{[contact.firstName, contact.lastName].filter(Boolean).join(' ') || '-'}</td>
                    <td>
                      <Link href={`/dashboard/lists/${contact.listId}`}>{contact.listName}</Link>
                    </td>
                    <td>{contact.status}</td>
                    <td>{contact.updatedAt ? new Date(contact.updatedAt).toLocaleString() : '-'}</td>
                    <td>
                      <button className="mini-btn" type="button" onClick={() => selectContact(contact)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
