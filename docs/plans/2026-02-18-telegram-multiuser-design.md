# Telegram Multi-User Integration Design

**Date:** 2026-02-18
**Status:** Approved

## Problem

The current Telegram bot is hardcoded to a single user via `TELEGRAM_CHAT_ID` and `TELEGRAM_USER_EMAIL` environment variables. This does not scale — every new user would require a new set of env vars and a server restart.

## Goal

Every app user can connect their own Telegram account to the shared bot via a self-service flow in Settings. The bot routes all messages by `chat_id`, looking up the correct user dynamically.

## Approach

Token-based deep link (industry standard):

1. User clicks **Connect Telegram** in Settings
2. Server generates a one-time token (15 min expiry), stores it in a new `telegram_link_tokens` table
3. Server returns `t.me/<BOT_USERNAME>?start=<token>`
4. Client opens the link in a new tab — Telegram opens and sends `/start <token>` to the bot
5. Bot looks up the token → stores `telegram_chat_id` + `telegram_username` on the user row → confirms connection

---

## Database Changes (`server/db.ts`)

### Alter `users` table
```sql
ALTER TABLE users ADD COLUMN telegram_chat_id INTEGER UNIQUE;
ALTER TABLE users ADD COLUMN telegram_username TEXT;
```
Both nullable. Applied as safe migrations (check column existence first).

### New `telegram_link_tokens` table
```sql
CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_token ON telegram_link_tokens(token);
```

### DB helper methods
- `users.setTelegramChat(userId, chatId, username)` — store after bot confirms
- `users.clearTelegramChat(userId)` — disconnect
- `users.findByTelegramChatId(chatId)` — bot lookup per incoming message
- `telegramLinkTokens.create(userId, token, expiresAt)`
- `telegramLinkTokens.findByToken(token)` — returns token row if valid and unused
- `telegramLinkTokens.markUsed(token)`

---

## Environment Variables

### Removed
- `TELEGRAM_CHAT_ID` — no longer needed (chat IDs stored per user in DB)
- `TELEGRAM_USER_EMAIL` — no longer needed

### Added
- `TELEGRAM_BOT_USERNAME` — the bot's username (e.g. `PhotoMessengerBot`) used to construct the deep link URL

### Unchanged
- `TELEGRAM_BOT_TOKEN` — still required to start the bot

---

## API Endpoints (`server/index.ts`)

### `POST /api/telegram/connect`
- Auth required
- Generates a cryptographically random token (32 hex chars)
- Stores in `telegram_link_tokens` with 15 min expiry
- Returns `{ url: "https://t.me/<BOT_USERNAME>?start=<token>" }`

### `DELETE /api/telegram/disconnect`
- Auth required
- Calls `users.clearTelegramChat(userId)`
- Returns `{ success: true }`

### `GET /api/settings/me` (existing)
- Add `telegram_username: string | null` to response so UI knows connection state

---

## Bot Logic Refactor (`server/telegram.ts`)

### Startup
Bot starts if `TELEGRAM_BOT_TOKEN` is set. No longer validates `TELEGRAM_CHAT_ID` or `TELEGRAM_USER_EMAIL`.

### `/start <token>` handler
```
1. Extract token from message text
2. Look up token in telegram_link_tokens (must be unused, not expired)
3. Mark token as used
4. Store chat_id + username on user row
5. Reply: "✅ Connected! You can now use @BotName to manage your clients."
```

### All other commands (`@Name: msg`, `/respond`, `/improve`, `/log`, `/clients`, `/help`)
```
1. Look up user by chat_id → users.findByTelegramChatId(msg.chat.id)
2. If not found → reply "Please connect your account first. Go to Settings → Connect Telegram."
3. Otherwise proceed with that user's data (same logic as today)
```

### Remove
- `guard()` function (hardcoded chat ID check) — replaced by per-user lookup
- `allowedChatId` and `userId` module-level variables

---

## Settings UI (`client/src/components/SettingsModal.tsx`)

New **Telegram** section, below Security:

**Not connected state:**
```
[Telegram]
Connect Telegram to log client messages and get AI drafts directly in the app.
[Connect Telegram]  ← button
```
On click: calls `POST /api/telegram/connect`, opens returned URL in new tab, shows:
> "Tap the link to open Telegram and complete setup. Come back and refresh Settings to confirm."

**Connected state:**
```
[Telegram]
✅ Connected as @username
[Disconnect]  ← button
```
On click: calls `DELETE /api/telegram/disconnect`, clears state locally.

`telegram_username` comes from the existing settings fetch (`GET /api/settings/me`).

---

## Files Changed

| File | Change |
|------|--------|
| `server/db.ts` | Add columns + table + helpers |
| `server/telegram.ts` | Full refactor — per-user routing, /start token flow |
| `server/index.ts` | Add `/api/telegram/connect` + `/api/telegram/disconnect` endpoints; include `telegram_username` in settings response |
| `client/src/api.ts` | Add `connectTelegram()` and `disconnectTelegram()` functions |
| `client/src/components/SettingsModal.tsx` | Add Telegram section |
| `client/src/types.ts` | Add `telegram_username` to Settings type |
| `.env.example` | Remove `TELEGRAM_CHAT_ID` + `TELEGRAM_USER_EMAIL`, add `TELEGRAM_BOT_USERNAME` |

---

## Out of Scope

- Telegram notifications (bot proactively messaging users) — not requested
- Multiple Telegram accounts per user — one per user is sufficient
- Rate limiting bot commands — existing plan limits already apply via DB
