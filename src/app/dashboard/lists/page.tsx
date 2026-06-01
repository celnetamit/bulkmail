'use client';

import { FormEvent, useEffect, useState } from 'react';

type ListItem = {
  id: string;
  name: string;
  description: string | null;
  contactsCount: number;
  campaignsCount: number;
};

type Contact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
};

export default function ListsPage() {
  const [lists, setLists] = useState<ListItem[]>([]);
  const [selectedListId, setSelectedListId] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [message, setMessage] = useState('');

  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');

  const [contactEmail, setContactEmail] = useState('');
  const [contactFirstName, setContactFirstName] = useState('');
  const [contactLastName, setContactLastName] = useState('');
  const [csvText, setCsvText] = useState('');

  async function loadLists() {
    const response = await fetch('/api/lists', { cache: 'no-store' });
    const data = (await response.json()) as { lists: ListItem[] };
    setLists(data.lists || []);
    if (!selectedListId && data.lists?.length) setSelectedListId(data.lists[0].id);
  }

  async function loadContacts(listId: string) {
    if (!listId) {
      setContacts([]);
      return;
    }

    const response = await fetch(`/api/contacts?listId=${listId}`, { cache: 'no-store' });
    const data = (await response.json()) as { contacts: Contact[] };
    setContacts(data.contacts || []);
  }

  useEffect(() => {
    loadLists();
  }, []);

  useEffect(() => {
    loadContacts(selectedListId);
  }, [selectedListId]);

  async function createList(event: FormEvent) {
    event.preventDefault();
    setMessage('');

    const response = await fetch('/api/lists', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: newListName, description: newListDescription }),
    });

    if (!response.ok) {
      setMessage('Failed to create list.');
      return;
    }

    setNewListName('');
    setNewListDescription('');
    setMessage('List created.');
    await loadLists();
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

    if (!response.ok) {
      setMessage('Failed to update list.');
      return;
    }

    setMessage('List updated.');
    await loadLists();
  }

  async function deleteList(list: ListItem) {
    if (!confirm(`Delete list "${list.name}"?`)) return;

    const response = await fetch(`/api/lists/${list.id}`, { method: 'DELETE' });
    if (!response.ok) {
      setMessage('Failed to delete list.');
      return;
    }

    if (selectedListId === list.id) setSelectedListId('');
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

    if (!response.ok) {
      setMessage('Failed to add contact.');
      return;
    }

    setContactEmail('');
    setContactFirstName('');
    setContactLastName('');
    setMessage('Contact added.');
    await Promise.all([loadLists(), loadContacts(selectedListId)]);
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
    await Promise.all([loadLists(), loadContacts(selectedListId)]);
  }

  async function updateContactStatus(contactId: string, status: string) {
    const response = await fetch(`/api/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      setMessage('Failed to update contact status.');
      return;
    }

    setMessage('Contact status updated.');
    await loadContacts(selectedListId);
  }

  async function deleteContact(contactId: string) {
    const response = await fetch(`/api/contacts/${contactId}`, { method: 'DELETE' });
    if (!response.ok) {
      setMessage('Failed to delete contact.');
      return;
    }

    setMessage('Contact deleted.');
    await Promise.all([loadLists(), loadContacts(selectedListId)]);
  }

  return (
    <div className="overview">
      <header className="page-header">
        <h1>Lists and Contacts</h1>
        <p>Manage lists, import subscribers, and maintain contact status lifecycle.</p>
      </header>

      {message ? <p className="form-note">{message}</p> : null}

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2>Create List</h2>
        <form className="auth-form" onSubmit={createList}>
          <input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="List name" required />
          <input value={newListDescription} onChange={(e) => setNewListDescription(e.target.value)} placeholder="Description" />
          <button className="btn-primary" type="submit">Create</button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Contacts</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {lists.length === 0 ? (
              <tr><td colSpan={4}>No lists yet.</td></tr>
            ) : (
              lists.map((list) => (
                <tr key={list.id}>
                  <td>
                    <button className="link-btn" onClick={() => setSelectedListId(list.id)}>{list.name}</button>
                  </td>
                  <td>{list.description || '-'}</td>
                  <td>{list.contactsCount}</td>
                  <td>
                    <button className="mini-btn" onClick={() => updateList(list)}>Edit</button>
                    <button className="mini-btn danger" onClick={() => deleteList(list)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2>Add Contact</h2>
        <form className="auth-form" onSubmit={addContact}>
          <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="email@example.com" type="email" required />
          <input value={contactFirstName} onChange={(e) => setContactFirstName(e.target.value)} placeholder="First name" />
          <input value={contactLastName} onChange={(e) => setContactLastName(e.target.value)} placeholder="Last name" />
          <button className="btn-primary" type="submit" disabled={!selectedListId}>Add Contact</button>
        </form>
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2>Import CSV</h2>
        <p>Format: `email,firstName,lastName` (header optional)</p>
        <form className="auth-form" onSubmit={importCsv}>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={'email,firstName,lastName\nuser1@example.com,Jane,Doe'}
            rows={6}
            className="auth-textarea"
          />
          <button className="btn-primary" type="submit" disabled={!selectedListId}>Import Contacts</button>
        </form>
      </div>

      <div className="card">
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
                    <button className="mini-btn danger" onClick={() => deleteContact(contact.id)}>Delete</button>
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
