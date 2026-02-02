import { useState } from 'react';
import type { Client } from '../types';
import { createClient, updateClient, deleteClient } from '../api';
import './ClientList.css';

interface Props {
  clients: Client[];
  selectedClient: Client | null;
  onSelect: (client: Client) => void;
  onClientsUpdated: (clients: Client[]) => void;
}

export default function ClientList({ clients, selectedClient, onSelect, onClientsUpdated }: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');

  async function handleAdd() {
    if (!newName.trim()) return;
    const client = await createClient(newName.trim(), newNotes.trim());
    onClientsUpdated([...clients, client]);
    setNewName('');
    setNewNotes('');
    setShowAddForm(false);
    onSelect(client);
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;
    const updated = await updateClient(id, { name: editName.trim(), notes: editNotes.trim() });
    onClientsUpdated(clients.map(c => c.id === id ? updated : c));
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this client and all their messages?')) return;
    await deleteClient(id);
    onClientsUpdated(clients.filter(c => c.id !== id));
  }

  function startEdit(client: Client, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(client.id);
    setEditName(client.name);
    setEditNotes(client.notes);
  }

  return (
    <div className="client-list">
      <div className="clients">
        {clients.map(client => (
          <div key={client.id}>
            {editingId === client.id ? (
              <div className="client-edit-form">
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Name"
                  autoFocus
                />
                <input
                  type="text"
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Notes (optional)"
                />
                <div className="form-actions">
                  <button className="btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                  <button className="btn-primary" onClick={() => handleUpdate(client.id)}>Save</button>
                </div>
              </div>
            ) : (
              <div
                className={`client-item ${selectedClient?.id === client.id ? 'selected' : ''}`}
                onClick={() => onSelect(client)}
              >
                <div className="client-info">
                  <span className="client-name">{client.name}</span>
                  {client.notes && <span className="client-notes">{client.notes}</span>}
                </div>
                <div className="client-actions">
                  <button className="action-btn" onClick={(e) => startEdit(client, e)} title="Edit">✏️</button>
                  <button className="action-btn" onClick={(e) => { e.stopPropagation(); handleDelete(client.id); }} title="Delete">🗑️</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showAddForm ? (
        <div className="add-form">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Client name"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <input
            type="text"
            value={newNotes}
            onChange={e => setNewNotes(e.target.value)}
            placeholder="Notes (e.g., Wedding June 2026)"
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <div className="form-actions">
            <button className="btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleAdd}>Add</button>
          </div>
        </div>
      ) : (
        <button className="add-btn" onClick={() => setShowAddForm(true)}>
          + Add Client
        </button>
      )}
    </div>
  );
}
