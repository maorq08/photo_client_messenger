// Database entity types

export interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  specialty: string;
  notes: string;
  tone: string;
  plan: 'free' | 'paid' | 'power';
  created_at: string;
  telegram_chat_id: number | null;
  telegram_username: string | null;
}

export interface SavedResponse {
  id: number;
  user_id: number;
  trigger: string;
  title: string;
  text: string;
}

export interface Client {
  id: number;
  user_id: number;
  name: string;
  notes: string;
  created_at: string;
}

export interface Message {
  id: number;
  client_id: number;
  sender: 'client' | 'me';
  text: string;
  timestamp: string;
}

export interface Usage {
  id: number;
  user_id: number;
  month: string;
  ai_respond_count: number;
  ai_improve_count: number;
  transcribe_count: number;
}

// API response types

export interface UserPublic {
  id: number;
  email: string;
  name: string;
  specialty: string;
  notes: string;
  tone: string;
  plan: 'free' | 'paid' | 'power';
}

export interface SettingsResponse {
  name: string;
  specialty: string;
  notes: string;
  tone: string;
  telegram_username: string | null;
  savedResponses: Array<{
    id: string;
    trigger: string;
    title: string;
    text: string;
  }>;
}

export interface ClientResponse {
  id: string;
  name: string;
  notes: string;
}

export interface MessageResponse {
  id: string;
  clientId: string;
  from: 'client' | 'me';
  text: string;
  timestamp: string;
}

export interface UsageResponse {
  aiRespond: { current: number; limit: number };
  aiImprove: { current: number; limit: number };
  transcribe: { current: number; limit: number };
  clients: { current: number; limit: number };
  resetDate: string;
}

export interface LimitError {
  error: 'limit_exceeded';
  limitType: 'clients' | 'messagesPerClient' | 'aiRespond' | 'aiImprove' | 'transcribe';
  current: number;
  limit: number;
  resetDate: string;
  message: string;
}

// Express session extension
declare module 'express-session' {
  interface SessionData {
    userId: number;
  }
}
