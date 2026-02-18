import type { Settings, Client, Message, User, Usage, LimitErrorData } from './types';

const API_BASE = '/api';

// Custom error class for rate limit errors
export class RateLimitError extends Error {
  data: LimitErrorData;

  constructor(data: LimitErrorData) {
    super(data.message);
    this.name = 'RateLimitError';
    this.data = data;
  }
}

// Helper to handle responses with auth and rate limit checks
async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    // Trigger auth state refresh by dispatching event
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error('Authentication required');
  }

  if (res.status === 429) {
    const data = await res.json();
    throw new RateLimitError(data);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(data.error || 'Request failed');
  }

  return res.json();
}

// Auth API

export async function authSignup(email: string, password: string, name?: string): Promise<{ user: User }> {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password, name }),
  });
  return handleResponse(res);
}

export async function authLogin(email: string, password: string): Promise<{ user: User }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(res);
}

export async function authLogout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

export async function authGetMe(): Promise<{ user: User } | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      credentials: 'include',
    });
    if (res.status === 401) {
      return null;
    }
    return res.json();
  } catch {
    return null;
  }
}

export async function authChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(data.error || 'Failed to change password');
  }
}

export async function authForgotPassword(email: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(data.error || 'Failed to process request');
  }
}

export async function authResetPassword(token: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(data.error || 'Failed to reset password');
  }
}

// Settings API

export async function fetchSettings(): Promise<Settings> {
  const res = await fetch(`${API_BASE}/settings`, {
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function updateSettings(settings: Settings): Promise<Settings> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(settings),
  });
  return handleResponse(res);
}

// Clients API

export async function fetchClients(): Promise<Client[]> {
  const res = await fetch(`${API_BASE}/clients`, {
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function createClient(name: string, notes: string = ''): Promise<Client> {
  const res = await fetch(`${API_BASE}/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name, notes }),
  });
  return handleResponse(res);
}

export async function updateClient(id: string, data: Partial<Client>): Promise<Client> {
  const res = await fetch(`${API_BASE}/clients/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteClient(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/clients/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok && res.status !== 401) {
    throw new Error('Failed to delete client');
  }
}

// Messages API

export async function fetchMessages(clientId: string): Promise<Message[]> {
  const res = await fetch(`${API_BASE}/messages/${clientId}`, {
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function createMessage(clientId: string, from: 'client' | 'me', text: string): Promise<Message> {
  const res = await fetch(`${API_BASE}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ clientId, from, text }),
  });
  return handleResponse(res);
}

// Usage API

export async function fetchUsage(): Promise<Usage> {
  const res = await fetch(`${API_BASE}/usage`, {
    credentials: 'include',
  });
  return handleResponse(res);
}

// AI API

export async function checkAIStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/ai/status`, {
      credentials: 'include',
    });
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
    credentials: 'include',
    body: JSON.stringify({ clientId, clientName }),
  });

  if (res.status === 429) {
    const data = await res.json();
    throw new RateLimitError(data);
  }

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
    credentials: 'include',
    body: JSON.stringify({ draft, clientId, clientName }),
  });

  if (res.status === 429) {
    const data = await res.json();
    throw new RateLimitError(data);
  }

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
    credentials: 'include',
    body: JSON.stringify({ audio: audioBase64, mimeType }),
  });

  if (res.status === 429) {
    const data = await res.json();
    throw new RateLimitError(data);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data.transcript;
}

// Telegram API

export async function connectTelegram(): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE}/telegram/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function disconnectTelegram(): Promise<void> {
  const res = await fetch(`${API_BASE}/telegram/disconnect`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse(res);
}
