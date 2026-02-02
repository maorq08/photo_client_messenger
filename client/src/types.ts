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
