export interface Settings {
  name: string;
  specialty: string;
  notes: string;
  tone?: string;
  savedResponses: SavedResponse[];
}

export interface SavedResponse {
  id: string;
  trigger: string;
  title: string;
  text: string;
}

export interface Client {
  id: string;
  name: string;
  notes: string;
}

export interface Message {
  id: string;
  clientId: string;
  from: 'client' | 'me';
  text: string;
  timestamp: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  specialty: string;
  notes: string;
  tone: string;
  plan: 'free' | 'paid' | 'power';
}

export interface Usage {
  aiRespond: { current: number; limit: number };
  aiImprove: { current: number; limit: number };
  transcribe: { current: number; limit: number };
  clients: { current: number; limit: number };
  resetDate: string;
}

export interface LimitErrorData {
  error: 'limit_exceeded';
  limitType: 'clients' | 'messagesPerClient' | 'aiRespond' | 'aiImprove' | 'transcribe';
  current: number;
  limit: number;
  resetDate: string;
  message: string;
}
