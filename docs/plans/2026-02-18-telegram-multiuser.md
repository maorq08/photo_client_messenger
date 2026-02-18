# Telegram Multi-User Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hardcoded single-user Telegram bot with a per-user connection system where any app user can link their own Telegram account via a one-tap deep link from Settings.

**Architecture:** Each user row gains `telegram_chat_id` + `telegram_username` columns. A new `telegram_link_tokens` table stores short-lived tokens. When a user clicks "Connect Telegram" in Settings, the server generates a token and returns a `t.me/BotName?start=<token>` URL. The bot handles `/start <token>` to link the account. All bot commands then route by `chat_id` instead of a hardcoded user.

**Tech Stack:** SQLite (better-sqlite3), Express, node-telegram-bot-api, React + TypeScript

**Design doc:** `docs/plans/2026-02-18-telegram-multiuser-design.md`

---

## Task 1: DB — Add columns and telegram_link_tokens table

**Files:**
- Modify: `server/db.ts`

The schema runs via `db.exec()` on startup. We add columns with a try/catch pattern (SQLite's only safe way to add a column idempotently). The new table uses `CREATE TABLE IF NOT EXISTS` which is safe.

**Step 1: Add the column migrations after the `db.exec(...)` block (~line 80)**

Find this line in `server/db.ts`:
```typescript
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
`);
```

Replace with:
```typescript
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);

  CREATE TABLE IF NOT EXISTS telegram_link_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_token ON telegram_link_tokens(token);
`);

// Add telegram columns to users if not present (safe migration)
try { db.exec(`ALTER TABLE users ADD COLUMN telegram_chat_id INTEGER`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN telegram_username TEXT`); } catch {}
// Unique index on telegram_chat_id (partial — only when not null)
try {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL`);
} catch {}
```

**Step 2: Add DB helpers for `users` — extend the `users` export object**

Find the closing brace of `export const users = { ... };` block (around line 126) and add these three methods before the closing `};`:

```typescript
  setTelegramChat(id: number, chatId: number, username: string): void {
    db.prepare(`UPDATE users SET telegram_chat_id = ?, telegram_username = ? WHERE id = ?`).run(chatId, username, id);
  },

  clearTelegramChat(id: number): void {
    db.prepare(`UPDATE users SET telegram_chat_id = NULL, telegram_username = NULL WHERE id = ?`).run(id);
  },

  findByTelegramChatId(chatId: number): User | undefined {
    return db.prepare<[number], User>(`SELECT * FROM users WHERE telegram_chat_id = ?`).get(chatId);
  },
```

**Step 3: Add `telegramLinkTokens` export — add at the end of `server/db.ts` before `export default db`**

```typescript
// ============== Telegram Link Token Queries ==============

interface TelegramLinkToken {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
  used: number;
  created_at: string;
}

const insertTelegramLinkToken = db.prepare<[number, string, string]>(`
  INSERT INTO telegram_link_tokens (user_id, token, expires_at) VALUES (?, ?, ?)
`);

const getTelegramLinkToken = db.prepare<[string], TelegramLinkToken>(`
  SELECT * FROM telegram_link_tokens WHERE token = ? AND used = 0
`);

const markTelegramLinkTokenUsed = db.prepare<[string]>(`
  UPDATE telegram_link_tokens SET used = 1 WHERE token = ?
`);

const deleteExpiredTelegramTokens = db.prepare(`
  DELETE FROM telegram_link_tokens WHERE expires_at < datetime('now') OR used = 1
`);

export const telegramLinkTokens = {
  create(userId: number, token: string, expiresAt: Date): void {
    deleteExpiredTelegramTokens.run();
    insertTelegramLinkToken.run(userId, token, expiresAt.toISOString());
  },

  findByToken(token: string): TelegramLinkToken | undefined {
    const result = getTelegramLinkToken.get(token);
    if (result && new Date(result.expires_at) < new Date()) {
      return undefined;
    }
    return result;
  },

  markUsed(token: string): void {
    markTelegramLinkTokenUsed.run(token);
  },
};
```

**Step 4: Verify the server still starts**

```bash
npm run server
```

Expected: Server starts, no errors. Check the startup log — it should still show "AI features enabled" and "Voice input enabled".

**Step 5: Commit**

```bash
git add server/db.ts
git commit -m "feat: add telegram_chat_id columns and telegram_link_tokens table"
```

---

## Task 2: Server types — update User and SettingsResponse

**Files:**
- Modify: `server/types.ts`

**Step 1: Add telegram fields to the `User` interface**

Find:
```typescript
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
}
```

Replace with:
```typescript
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
```

**Step 2: Add `telegram_username` to `SettingsResponse`**

Find:
```typescript
export interface SettingsResponse {
  name: string;
  specialty: string;
  notes: string;
  tone: string;
  savedResponses: Array<{
    id: string;
    trigger: string;
    title: string;
    text: string;
  }>;
}
```

Replace with:
```typescript
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
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p server/tsconfig.json 2>/dev/null || npx tsc --noEmit
```

Expected: No errors (or pre-existing errors unchanged — we haven't wired everything up yet).

**Step 4: Commit**

```bash
git add server/types.ts
git commit -m "feat: add telegram fields to server User and SettingsResponse types"
```

---

## Task 3: Server routes — settings + telegram connect/disconnect

**Files:**
- Modify: `server/index.ts`

**Step 1: Add `telegramLinkTokens` to the db import at the top of `server/index.ts`**

Find:
```typescript
import db, { users, savedResponses, clients, messages, usage } from './db';
```

Replace with:
```typescript
import db, { users, savedResponses, clients, messages, usage, telegramLinkTokens } from './db';
```

**Step 2: Add `randomBytes` to the `fs` import line**

Find:
```typescript
import { writeFileSync, unlinkSync, createReadStream } from 'fs';
```

Replace with:
```typescript
import { writeFileSync, unlinkSync, createReadStream } from 'fs';
import { randomBytes } from 'crypto';
```

**Step 3: Update `GET /api/settings` to include `telegram_username`**

Find:
```typescript
  res.json({
    name: user.name,
    specialty: user.specialty,
    notes: user.notes,
    tone: user.tone,
    savedResponses: responses.map(r => ({
      id: String(r.id),
      trigger: r.trigger,
      title: r.title,
      text: r.text,
    })),
  });
});
```
(This is in `app.get('/api/settings', ...)`)

Replace with:
```typescript
  res.json({
    name: user.name,
    specialty: user.specialty,
    notes: user.notes,
    tone: user.tone,
    telegram_username: user.telegram_username ?? null,
    savedResponses: responses.map(r => ({
      id: String(r.id),
      trigger: r.trigger,
      title: r.title,
      text: r.text,
    })),
  });
});
```

**Step 4: Update `PUT /api/settings` to include `telegram_username` in response**

Find the `res.json({...})` inside `app.put('/api/settings', ...)`:
```typescript
  res.json({
    name: updatedUser.name,
    specialty: updatedUser.specialty,
    notes: updatedUser.notes,
    tone: updatedUser.tone,
    savedResponses: responses.map(r => ({
      id: String(r.id),
      trigger: r.trigger,
      title: r.title,
      text: r.text,
    })),
  });
```

Replace with:
```typescript
  res.json({
    name: updatedUser.name,
    specialty: updatedUser.specialty,
    notes: updatedUser.notes,
    tone: updatedUser.tone,
    telegram_username: updatedUser.telegram_username ?? null,
    savedResponses: responses.map(r => ({
      id: String(r.id),
      trigger: r.trigger,
      title: r.title,
      text: r.text,
    })),
  });
```

**Step 5: Add the two Telegram API endpoints — insert after the `PUT /api/settings` handler and before `// Clients endpoints`**

```typescript
// Telegram integration endpoints
app.post('/api/telegram/connect', async (req, res) => {
  const user = req.user as User;
  const botUsername = getBotUsername();

  if (!botUsername) {
    return res.status(503).json({ error: 'Telegram bot not configured. Set TELEGRAM_BOT_TOKEN.' });
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  telegramLinkTokens.create(user.id, token, expiresAt);

  res.json({ url: `https://t.me/${botUsername}?start=${token}` });
});

app.delete('/api/telegram/disconnect', (req, res) => {
  const user = req.user as User;
  users.clearTelegramChat(user.id);
  res.json({ success: true });
});
```

**Step 6: Add `getBotUsername` import from telegram.ts**

Find:
```typescript
import { startTelegramBot } from './telegram';
```

Replace with:
```typescript
import { startTelegramBot, getBotUsername } from './telegram';
```

**Step 7: Verify server starts and settings endpoint returns `telegram_username`**

```bash
npm run server
```

In a new terminal (with the server running and logged in via browser — grab the cookie from devtools):
```bash
curl -s http://localhost:3001/api/settings \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" | jq .
```

Expected: Response includes `"telegram_username": null` field.

**Step 8: Commit**

```bash
git add server/index.ts
git commit -m "feat: add telegram connect/disconnect endpoints and telegram_username to settings"
```

---

## Task 4: Bot refactor — per-user routing and /start token flow

**Files:**
- Modify: `server/telegram.ts`

This is a full replacement of the file. Replace the entire contents of `server/telegram.ts` with:

```typescript
import TelegramBot from 'node-telegram-bot-api';
import { clients, messages, users, telegramLinkTokens } from './db';
import { generateResponse, improveMessage, isAIAvailable } from './ai';
import { PLAN_LIMITS } from './limits';
import type { Client } from './types';

interface BotSession {
  activeClientId: number | null;
  lastDraft: string | null;
}

// In-memory session state per chat (resets on server restart)
const sessions = new Map<number, BotSession>();

function getSession(chatId: number): BotSession {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { activeClientId: null, lastDraft: null });
  }
  return sessions.get(chatId)!;
}

// Bot username — resolved after bot starts
let _botUsername: string | null = null;

export function getBotUsername(): string | null {
  return _botUsername;
}

export function findOrCreateClient(
  userId: number,
  name: string
): { client: Client; isNew: boolean } {
  const userClients = clients.findByUser(userId);
  const normalized = name.toLowerCase().trim();
  const match = userClients.find(c => c.name.toLowerCase() === normalized);
  if (match) return { client: match, isNew: false };

  const user = users.findById(userId)!;
  const limit = PLAN_LIMITS[user.plan].clients;
  if (userClients.length >= limit) {
    throw new Error(`Client limit reached (${limit} clients on ${user.plan} plan).`);
  }

  const id = clients.create(userId, name.trim());
  return { client: clients.findById(id)!, isNew: true };
}

export function startTelegramBot(): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.log('ℹ️  Telegram bot disabled — set TELEGRAM_BOT_TOKEN to enable');
    return;
  }

  const bot = new TelegramBot(token, { polling: true });

  // Resolve and store the bot username on startup
  bot.getMe().then(me => {
    _botUsername = me.username ?? null;
    console.log(`✅ Telegram bot started (@${_botUsername}, polling)`);
  }).catch(err => {
    console.error('Telegram bot failed to get username:', err.message);
  });

  bot.on('polling_error', (err) => {
    console.error('Telegram polling error:', err.message);
  });

  function send(chatId: number, text: string): void {
    bot.sendMessage(chatId, text).catch((err: Error) => {
      console.error(`Failed to send Telegram message to ${chatId}:`, err.message);
    });
  }

  // Helper: look up the app user by chat ID, send error if not linked
  function requireLinkedUser(chatId: number): ReturnType<typeof users.findByTelegramChatId> {
    const user = users.findByTelegramChatId(chatId);
    if (!user) {
      send(chatId, '⚠️ Your Telegram is not connected to an account.\n\nGo to Settings → Connect Telegram in the app to link your account.');
    }
    return user;
  }

  const HELP_TEXT = [
    'Commands:',
    '',
    '@ClientName: their message — Log a client message',
    '/respond — Generate AI draft for active client',
    '/improve <draft text> — Improve your own draft',
    '/log — Save last draft as sent',
    '/clients — List all clients',
    '/help — Show this help',
  ].join('\n');

  // /start <token> — link Telegram account to app user
  bot.onText(/^\/start(?: (.+))?$/, (msg, match) => {
    const chatId = msg.chat.id;
    const token = match?.[1]?.trim();

    if (!token) {
      // Plain /start with no token — show help or prompt to connect
      const existingUser = users.findByTelegramChatId(chatId);
      if (existingUser) {
        send(chatId, `✅ Already connected as ${existingUser.name}.\n\n${HELP_TEXT}`);
      } else {
        send(chatId, 'Welcome! To connect your account, go to Settings → Connect Telegram in the app and tap the link.');
      }
      return;
    }

    const linkToken = telegramLinkTokens.findByToken(token);
    if (!linkToken) {
      send(chatId, '❌ This link has expired or is invalid. Go to Settings → Connect Telegram to generate a new one.');
      return;
    }

    telegramLinkTokens.markUsed(token);

    const username = msg.from?.username ?? msg.from?.first_name ?? 'unknown';
    users.setTelegramChat(linkToken.user_id, chatId, username);

    const user = users.findById(linkToken.user_id);
    send(chatId, `✅ Connected! Hi ${user?.name || 'there'}, you can now use this bot to manage your clients.\n\n${HELP_TEXT}`);
  });

  // @ClientName: message — log client message
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    if (!text || text.startsWith('/')) return;

    const user = requireLinkedUser(chatId);
    if (!user) return;

    const match = text.match(/^@([^:]+):\s*(.+)$/s);
    if (!match) {
      send(chatId, 'To log a client message use:\n@ClientName: their message\n\nOr type /help for all commands.');
      return;
    }

    const [, rawName, clientMessage] = match;
    let client: Client;
    let isNew: boolean;
    try {
      ({ client, isNew } = findOrCreateClient(user.id, rawName.trim()));
    } catch (err) {
      send(chatId, err instanceof Error ? err.message : 'Failed to find or create client.');
      return;
    }
    messages.create(client.id, 'client', clientMessage.trim());

    const session = getSession(chatId);
    session.activeClientId = client.id;
    session.lastDraft = null;

    const prefix = isNew ? `Created new client: ${client.name}` : `Logged for ${client.name}`;
    send(chatId, `${prefix} ✓\n\nUse /respond to generate a reply, or /improve <your draft>`);
  });

  bot.onText(/^\/respond$/, async (msg) => {
    const chatId = msg.chat.id;
    const user = requireLinkedUser(chatId);
    if (!user) return;

    const session = getSession(chatId);
    if (!session.activeClientId) {
      send(chatId, 'No active client. Send @ClientName: their message first.');
      return;
    }
    if (!isAIAvailable()) {
      send(chatId, 'AI unavailable — ANTHROPIC_API_KEY not set.');
      return;
    }

    const client = clients.findById(session.activeClientId);
    if (!client) {
      send(chatId, 'Active client not found. Send @ClientName: message to re-establish.');
      return;
    }

    await bot.sendMessage(chatId, 'Generating...');
    try {
      const freshUser = users.findById(user.id)!;
      const clientMessages = messages.findByClient(client.id);
      const draft = await generateResponse(freshUser, client, clientMessages);
      session.lastDraft = draft;
      send(chatId, `Draft:\n\n${draft}\n\n—\nUse /log to save as sent, or /improve <edited version>`);
    } catch {
      send(chatId, 'Failed to generate response. Try again.');
    }
  });

  bot.onText(/^\/improve (.+)$/s, async (msg, match) => {
    const chatId = msg.chat.id;
    const user = requireLinkedUser(chatId);
    if (!user) return;

    const session = getSession(chatId);
    if (!session.activeClientId) {
      send(chatId, 'No active client. Send @ClientName: their message first.');
      return;
    }
    if (!isAIAvailable()) {
      send(chatId, 'AI unavailable — ANTHROPIC_API_KEY not set.');
      return;
    }

    const draft = match?.[1]?.trim();
    if (!draft) {
      send(chatId, 'Usage: /improve your draft text here');
      return;
    }

    const client = clients.findById(session.activeClientId);
    if (!client) {
      send(chatId, 'Active client not found.');
      return;
    }

    await bot.sendMessage(chatId, 'Improving...');
    try {
      const freshUser = users.findById(user.id)!;
      const clientMessages = messages.findByClient(client.id);
      const improved = await improveMessage(freshUser, client, clientMessages, draft);
      session.lastDraft = improved;
      send(chatId, `Improved:\n\n${improved}\n\n—\nUse /log to save as sent`);
    } catch {
      send(chatId, 'Failed to improve message. Try again.');
    }
  });

  bot.onText(/^\/log$/, (msg) => {
    const chatId = msg.chat.id;
    const user = requireLinkedUser(chatId);
    if (!user) return;

    const session = getSession(chatId);
    if (!session.activeClientId || !session.lastDraft) {
      send(chatId, 'Nothing to log. Use /respond or /improve first.');
      return;
    }

    messages.create(session.activeClientId, 'me', session.lastDraft);
    session.lastDraft = null;
    send(chatId, 'Response logged as sent ✓');
  });

  bot.onText(/^\/clients$/, (msg) => {
    const chatId = msg.chat.id;
    const user = requireLinkedUser(chatId);
    if (!user) return;

    const userClients = clients.findByUser(user.id);
    if (userClients.length === 0) {
      send(chatId, 'No clients yet.\nStart with: @ClientName: their message');
      return;
    }

    const list = userClients.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    send(chatId, `Your clients:\n\n${list}`);
  });

  bot.onText(/^\/help$/, (msg) => {
    const chatId = msg.chat.id;
    const user = requireLinkedUser(chatId);
    if (!user) return;
    send(chatId, HELP_TEXT);
  });
}
```

**Step 2: Verify server starts cleanly**

```bash
npm run server
```

Expected: No TypeScript errors. If `TELEGRAM_BOT_TOKEN` is set, you'll see the bot username logged. If not set, you'll see `ℹ️  Telegram bot disabled`.

**Step 3: Commit**

```bash
git add server/telegram.ts
git commit -m "feat: refactor Telegram bot to per-user routing with /start token link flow"
```

---

## Task 5: Client types and API functions

**Files:**
- Modify: `client/src/types.ts`
- Modify: `client/src/api.ts`

**Step 1: Add `telegram_username` to the `Settings` interface in `client/src/types.ts`**

Find:
```typescript
export interface Settings {
  name: string;
  specialty: string;
  notes: string;
  tone?: string;
  savedResponses: SavedResponse[];
}
```

Replace with:
```typescript
export interface Settings {
  name: string;
  specialty: string;
  notes: string;
  tone?: string;
  telegram_username: string | null;
  savedResponses: SavedResponse[];
}
```

**Step 2: Add `connectTelegram` and `disconnectTelegram` to `client/src/api.ts`**

At the end of the file (after `transcribeAudio`), add:

```typescript
// Telegram API

export async function connectTelegram(): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE}/telegram/connect`, {
    method: 'POST',
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
```

**Step 3: Verify no TypeScript errors**

```bash
cd client && npx tsc --noEmit
```

Expected: No new errors. (If there are pre-existing errors, note them but don't fix here.)

**Step 4: Commit**

```bash
git add client/src/types.ts client/src/api.ts
git commit -m "feat: add telegram_username to Settings type and connectTelegram/disconnectTelegram API"
```

---

## Task 6: Settings UI — Telegram section

**Files:**
- Modify: `client/src/components/SettingsModal.tsx`

**Step 1: Add imports for the new API functions**

Find:
```typescript
import { updateSettings, authChangePassword } from '../api';
```

Replace with:
```typescript
import { updateSettings, authChangePassword, connectTelegram, disconnectTelegram } from '../api';
```

**Step 2: Add Telegram state variables — after the existing password state variables (around line 30)**

Find:
```typescript
  const [passwordSuccess, setPasswordSuccess] = useState(false);
```

After that line, add:
```typescript
  // Telegram state
  const [telegramUsername, setTelegramUsername] = useState<string | null>(settings.telegram_username ?? null);
  const [telegramConnecting, setTelegramConnecting] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [telegramLinkSent, setTelegramLinkSent] = useState(false);
```

**Step 3: Add handler functions — after `handleChangePassword` and before `const tonePresets`**

Find:
```typescript
  const tonePresets = [
```

Before that line, add:
```typescript
  async function handleConnectTelegram() {
    setTelegramError(null);
    setTelegramConnecting(true);
    setTelegramLinkSent(false);
    try {
      const { url } = await connectTelegram();
      window.open(url, '_blank');
      setTelegramLinkSent(true);
    } catch (err) {
      setTelegramError(err instanceof Error ? err.message : 'Failed to generate link');
    } finally {
      setTelegramConnecting(false);
    }
  }

  async function handleDisconnectTelegram() {
    setTelegramError(null);
    try {
      await disconnectTelegram();
      setTelegramUsername(null);
      setTelegramLinkSent(false);
    } catch (err) {
      setTelegramError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  }

  async function handleCheckTelegramStatus() {
    try {
      const { fetchSettings } = await import('../api');
      const updated = await fetchSettings();
      setTelegramUsername(updated.telegram_username ?? null);
      if (updated.telegram_username) {
        setTelegramLinkSent(false);
      }
    } catch {
      // silently ignore
    }
  }

```

**Step 4: Add the Telegram section to the modal — insert after the Security section and before Saved Responses**

Find:
```tsx
          <section className="settings-section">
            <h3>Saved Responses</h3>
```

Before that, insert:
```tsx
          <section className="settings-section">
            <h3>Telegram</h3>
            <p className="section-hint">Log client messages and get AI drafts from Telegram</p>

            {telegramError && <div className="field-error">{telegramError}</div>}

            {telegramUsername ? (
              <div>
                <p style={{ marginBottom: '8px' }}>✅ Connected as @{telegramUsername}</p>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleDisconnectTelegram}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleConnectTelegram}
                  disabled={telegramConnecting}
                >
                  {telegramConnecting ? 'Generating link...' : 'Connect Telegram'}
                </button>

                {telegramLinkSent && (
                  <div style={{ marginTop: '8px' }}>
                    <p className="section-hint">Tap the link that opened in Telegram to complete setup.</p>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ marginTop: '6px' }}
                      onClick={handleCheckTelegramStatus}
                    >
                      I connected — refresh status
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

```

**Step 5: Verify the client builds**

```bash
cd client && npm run build
```

Expected: Build succeeds. If there are type errors, fix them before committing.

**Step 6: Run development server and manually test**

```bash
npm run dev
```

Open the app, log in, go to Settings. You should see a new "Telegram" section with a "Connect Telegram" button. If `TELEGRAM_BOT_TOKEN` is not set, clicking will show an error ("Telegram bot not configured"). If set, it will open `t.me/BotName?start=<token>` in a new tab.

**Step 7: Commit**

```bash
git add client/src/components/SettingsModal.tsx
git commit -m "feat: add Telegram connect/disconnect section to Settings UI"
```

---

## Task 7: Env cleanup and push

**Files:**
- Modify: `.env.example`

**Step 1: Update `.env.example`**

Replace the entire Telegram section at the bottom:

Find:
```
# Telegram Bot (optional — enables phone entry point)
# 1. Create a bot: open Telegram, message @BotFather, send /newbot
TELEGRAM_BOT_TOKEN=

# 2. Find your chat ID: start the bot, send any message, then visit:
#    https://api.telegram.org/bot<TOKEN>/getUpdates  (look for "chat":{"id": ...})
TELEGRAM_CHAT_ID=

# 3. Your app login email (the bot acts as this user)
TELEGRAM_USER_EMAIL=
```

Replace with:
```
# Telegram Bot (optional — each user connects their own Telegram via Settings)
# 1. Create a bot: open Telegram, message @BotFather, send /newbot
# 2. Copy the token here
TELEGRAM_BOT_TOKEN=
```

**Step 2: Remove `TELEGRAM_CHAT_ID` and `TELEGRAM_USER_EMAIL` from your actual `.env` file**

Edit `.env` and delete these two lines:
```
TELEGRAM_CHAT_ID=...
TELEGRAM_USER_EMAIL=...
```

**Step 3: Final end-to-end test**

With `TELEGRAM_BOT_TOKEN` set in `.env`:

1. Start the server: `npm run server` — verify "✅ Telegram bot started (@BotName, polling)"
2. Open the app and log in
3. Open Settings — verify "Telegram" section appears
4. Click "Connect Telegram" — verify a new tab opens to `t.me/BotName?start=<64-char-hex>`
5. In Telegram, tap the link — verify bot responds with "✅ Connected! Hi [name]..."
6. Back in Settings, click "I connected — refresh status" — verify it shows "✅ Connected as @username"
7. Click "Disconnect" — verify it returns to the Connect button
8. In Telegram, send any command (e.g. `/clients`) — verify bot replies with the "not connected" message

**Step 4: Commit and push**

```bash
git add .env.example
git commit -m "chore: update .env.example for multi-user Telegram (remove TELEGRAM_CHAT_ID and TELEGRAM_USER_EMAIL)"
git push
```

---

## Summary of Changes

| File | What changes |
|------|-------------|
| `server/db.ts` | Add `telegram_link_tokens` table, `telegram_chat_id`/`telegram_username` columns on users, new DB helpers |
| `server/types.ts` | Add `telegram_chat_id`, `telegram_username` to `User`; add `telegram_username` to `SettingsResponse` |
| `server/index.ts` | Import `telegramLinkTokens` + `getBotUsername`; add `telegram_username` to settings responses; add `POST /api/telegram/connect` and `DELETE /api/telegram/disconnect` |
| `server/telegram.ts` | Full rewrite — per-user routing by `chat_id`, `/start <token>` link flow, export `getBotUsername()` |
| `client/src/types.ts` | Add `telegram_username: string \| null` to `Settings` |
| `client/src/api.ts` | Add `connectTelegram()` and `disconnectTelegram()` |
| `client/src/components/SettingsModal.tsx` | Add Telegram section with connect/disconnect/status UI |
| `.env.example` | Remove `TELEGRAM_CHAT_ID` and `TELEGRAM_USER_EMAIL` |
