import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { User, SavedResponse, Client, Message, Usage } from './types';

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    specialty TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    tone TEXT NOT NULL DEFAULT 'friendly and casual',
    plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free', 'paid', 'power')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS saved_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trigger TEXT DEFAULT '',
    title TEXT NOT NULL,
    text TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    sender TEXT NOT NULL CHECK(sender IN ('client', 'me')),
    text TEXT NOT NULL,
    timestamp TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    ai_respond_count INTEGER DEFAULT 0,
    ai_improve_count INTEGER DEFAULT 0,
    transcribe_count INTEGER DEFAULT 0,
    UNIQUE(user_id, month)
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_saved_responses_user ON saved_responses(user_id);
  CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
  CREATE INDEX IF NOT EXISTS idx_messages_client ON messages(client_id);
  CREATE INDEX IF NOT EXISTS idx_usage_user_month ON usage(user_id, month);
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
`);

// ============== User Queries ==============

const insertUser = db.prepare<[string, string, string, string, string, string, string]>(`
  INSERT INTO users (email, password_hash, name, specialty, notes, tone, plan)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const getUserById = db.prepare<[number], User>(`
  SELECT * FROM users WHERE id = ?
`);

const getUserByEmail = db.prepare<[string], User>(`
  SELECT * FROM users WHERE email = ?
`);

const updateUser = db.prepare<[string, string, string, string, number]>(`
  UPDATE users SET name = ?, specialty = ?, notes = ?, tone = ? WHERE id = ?
`);

const updateUserPassword = db.prepare<[string, number]>(`
  UPDATE users SET password_hash = ? WHERE id = ?
`);

export const users = {
  create(email: string, passwordHash: string, name = '', specialty = '', notes = '', tone = 'friendly and casual', plan: 'free' | 'paid' | 'power' = 'free'): number {
    const result = insertUser.run(email, passwordHash, name, specialty, notes, tone, plan);
    return result.lastInsertRowid as number;
  },

  findById(id: number): User | undefined {
    return getUserById.get(id);
  },

  findByEmail(email: string): User | undefined {
    return getUserByEmail.get(email);
  },

  update(id: number, data: { name: string; specialty: string; notes: string; tone: string }): void {
    updateUser.run(data.name, data.specialty, data.notes, data.tone, id);
  },

  updatePassword(id: number, passwordHash: string): void {
    updateUserPassword.run(passwordHash, id);
  },
};

// ============== SavedResponse Queries ==============

const getSavedResponsesByUser = db.prepare<[number], SavedResponse>(`
  SELECT * FROM saved_responses WHERE user_id = ? ORDER BY id
`);

const insertSavedResponse = db.prepare<[number, string, string, string]>(`
  INSERT INTO saved_responses (user_id, trigger, title, text) VALUES (?, ?, ?, ?)
`);

const updateSavedResponse = db.prepare<[string, string, string, number, number]>(`
  UPDATE saved_responses SET trigger = ?, title = ?, text = ? WHERE id = ? AND user_id = ?
`);

const deleteSavedResponse = db.prepare<[number, number]>(`
  DELETE FROM saved_responses WHERE id = ? AND user_id = ?
`);

const deleteSavedResponsesByUser = db.prepare<[number]>(`
  DELETE FROM saved_responses WHERE user_id = ?
`);

export const savedResponses = {
  findByUser(userId: number): SavedResponse[] {
    return getSavedResponsesByUser.all(userId);
  },

  create(userId: number, trigger: string, title: string, text: string): number {
    const result = insertSavedResponse.run(userId, trigger, title, text);
    return result.lastInsertRowid as number;
  },

  update(id: number, userId: number, data: { trigger: string; title: string; text: string }): void {
    updateSavedResponse.run(data.trigger, data.title, data.text, id, userId);
  },

  delete(id: number, userId: number): void {
    deleteSavedResponse.run(id, userId);
  },

  deleteAllForUser(userId: number): void {
    deleteSavedResponsesByUser.run(userId);
  },

  replaceAll(userId: number, responses: Array<{ trigger: string; title: string; text: string }>): void {
    const transaction = db.transaction(() => {
      deleteSavedResponsesByUser.run(userId);
      for (const r of responses) {
        insertSavedResponse.run(userId, r.trigger, r.title, r.text);
      }
    });
    transaction();
  },
};

// ============== Client Queries ==============

const getClientsByUser = db.prepare<[number], Client>(`
  SELECT * FROM clients WHERE user_id = ? ORDER BY id
`);

const getClientById = db.prepare<[number], Client>(`
  SELECT * FROM clients WHERE id = ?
`);

const getClientByIdAndUser = db.prepare<[number, number], Client>(`
  SELECT * FROM clients WHERE id = ? AND user_id = ?
`);

const insertClient = db.prepare<[number, string, string]>(`
  INSERT INTO clients (user_id, name, notes) VALUES (?, ?, ?)
`);

const updateClient = db.prepare<[string, string, number, number]>(`
  UPDATE clients SET name = ?, notes = ? WHERE id = ? AND user_id = ?
`);

const deleteClient = db.prepare<[number, number]>(`
  DELETE FROM clients WHERE id = ? AND user_id = ?
`);

const countClientsByUser = db.prepare<[number], { count: number }>(`
  SELECT COUNT(*) as count FROM clients WHERE user_id = ?
`);

export const clients = {
  findByUser(userId: number): Client[] {
    return getClientsByUser.all(userId);
  },

  findById(id: number): Client | undefined {
    return getClientById.get(id);
  },

  findByIdAndUser(id: number, userId: number): Client | undefined {
    return getClientByIdAndUser.get(id, userId);
  },

  create(userId: number, name: string, notes = ''): number {
    const result = insertClient.run(userId, name, notes);
    return result.lastInsertRowid as number;
  },

  update(id: number, userId: number, data: { name: string; notes: string }): void {
    updateClient.run(data.name, data.notes, id, userId);
  },

  delete(id: number, userId: number): void {
    deleteClient.run(id, userId);
  },

  countByUser(userId: number): number {
    return countClientsByUser.get(userId)?.count ?? 0;
  },
};

// ============== Message Queries ==============

const getMessagesByClient = db.prepare<[number], Message>(`
  SELECT * FROM messages WHERE client_id = ? ORDER BY timestamp, id
`);

const insertMessage = db.prepare<[number, string, string]>(`
  INSERT INTO messages (client_id, sender, text) VALUES (?, ?, ?)
`);

const countMessagesByClient = db.prepare<[number], { count: number }>(`
  SELECT COUNT(*) as count FROM messages WHERE client_id = ?
`);

export const messages = {
  findByClient(clientId: number): Message[] {
    return getMessagesByClient.all(clientId);
  },

  create(clientId: number, sender: 'client' | 'me', text: string): number {
    const result = insertMessage.run(clientId, sender, text);
    return result.lastInsertRowid as number;
  },

  countByClient(clientId: number): number {
    return countMessagesByClient.get(clientId)?.count ?? 0;
  },
};

// ============== Usage Queries ==============

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getNextMonthStart(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString();
}

const getUsage = db.prepare<[number, string], Usage>(`
  SELECT * FROM usage WHERE user_id = ? AND month = ?
`);

const upsertUsage = db.prepare<[number, string]>(`
  INSERT INTO usage (user_id, month, ai_respond_count, ai_improve_count, transcribe_count)
  VALUES (?, ?, 0, 0, 0)
  ON CONFLICT(user_id, month) DO NOTHING
`);

const incrementAiRespond = db.prepare<[number, string]>(`
  UPDATE usage SET ai_respond_count = ai_respond_count + 1 WHERE user_id = ? AND month = ?
`);

const incrementAiImprove = db.prepare<[number, string]>(`
  UPDATE usage SET ai_improve_count = ai_improve_count + 1 WHERE user_id = ? AND month = ?
`);

const incrementTranscribe = db.prepare<[number, string]>(`
  UPDATE usage SET transcribe_count = transcribe_count + 1 WHERE user_id = ? AND month = ?
`);

export const usage = {
  getCurrentMonth,
  getNextMonthStart,

  get(userId: number): Usage {
    const month = getCurrentMonth();
    upsertUsage.run(userId, month);
    return getUsage.get(userId, month)!;
  },

  incrementAiRespond(userId: number): void {
    const month = getCurrentMonth();
    upsertUsage.run(userId, month);
    incrementAiRespond.run(userId, month);
  },

  incrementAiImprove(userId: number): void {
    const month = getCurrentMonth();
    upsertUsage.run(userId, month);
    incrementAiImprove.run(userId, month);
  },

  incrementTranscribe(userId: number): void {
    const month = getCurrentMonth();
    upsertUsage.run(userId, month);
    incrementTranscribe.run(userId, month);
  },
};

// ============== Password Reset Token Queries ==============

interface PasswordResetToken {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
  used: number;
  created_at: string;
}

const insertResetToken = db.prepare<[number, string, string]>(`
  INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)
`);

const getResetToken = db.prepare<[string], PasswordResetToken>(`
  SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0
`);

const markTokenUsed = db.prepare<[string]>(`
  UPDATE password_reset_tokens SET used = 1 WHERE token = ?
`);

const deleteExpiredTokens = db.prepare(`
  DELETE FROM password_reset_tokens WHERE expires_at < datetime('now') OR used = 1
`);

export const passwordResetTokens = {
  create(userId: number, token: string, expiresAt: Date): void {
    // Clean up old tokens first
    deleteExpiredTokens.run();
    insertResetToken.run(userId, token, expiresAt.toISOString());
  },

  findByToken(token: string): PasswordResetToken | undefined {
    const result = getResetToken.get(token);
    if (result && new Date(result.expires_at) < new Date()) {
      return undefined; // Token expired
    }
    return result;
  },

  markUsed(token: string): void {
    markTokenUsed.run(token);
  },
};

export default db;
