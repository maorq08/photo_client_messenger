import type { Settings, Client, Message } from './types';

const API_BASE = '/api';

export async function fetchSettings(): Promise<Settings> {
  const res = await fetch(`${API_BASE}/settings`);
  return res.json();
}

export async function updateSettings(settings: Settings): Promise<Settings> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
  return res.json();
}

export async function fetchClients(): Promise<Client[]> {
  const res = await fetch(`${API_BASE}/clients`);
  return res.json();
}

export async function createClient(name: string, notes: string = ''): Promise<Client> {
  const res = await fetch(`${API_BASE}/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, notes })
  });
  return res.json();
}

export async function updateClient(id: string, data: Partial<Client>): Promise<Client> {
  const res = await fetch(`${API_BASE}/clients/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function deleteClient(id: string): Promise<void> {
  await fetch(`${API_BASE}/clients/${id}`, { method: 'DELETE' });
}

export async function fetchMessages(clientId: string): Promise<Message[]> {
  const res = await fetch(`${API_BASE}/messages/${clientId}`);
  return res.json();
}

export async function createMessage(clientId: string, from: 'client' | 'me', text: string): Promise<Message> {
  const res = await fetch(`${API_BASE}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, from, text })
  });
  return res.json();
}

export async function checkAIStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/ai/status`);
    const data = await res.json();
    return data.available;
  } catch {
    return false;
  }
}

export async function generateResponse(clientId: string, clientName: string): Promise<string> {
  const res = await fetch(`${API_BASE}/ai/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientName })
  });
  const data = await res.json();
  if (data.needsApiKey) {
    throw new Error('AI features require an API key. Set ANTHROPIC_API_KEY environment variable.');
  }
  if (data.error) {
    throw new Error(data.error);
  }
  return data.response;
}

export async function improveMessage(draft: string, clientId: string, clientName: string): Promise<string> {
  const res = await fetch(`${API_BASE}/ai/improve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft, clientId, clientName })
  });
  const data = await res.json();
  if (data.needsApiKey) {
    throw new Error('AI features require an API key. Set ANTHROPIC_API_KEY environment variable.');
  }
  if (data.error) {
    throw new Error(data.error);
  }
  return data.response;
}

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  const res = await fetch(`${API_BASE}/ai/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio: audioBase64, mimeType })
  });
  const data = await res.json();
  if (data.needsApiKey) {
    throw new Error('AI features require an API key. Set ANTHROPIC_API_KEY environment variable.');
  }
  if (data.error) {
    throw new Error(data.error);
  }
  return data.transcript;
}
