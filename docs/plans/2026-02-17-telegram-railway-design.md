# Design: Railway Deployment + Telegram Bot Entry Point

**Date:** 2026-02-17
**Status:** Approved

## Problem

The app currently only runs locally (`npm run dev`). The user wants to send client messages and trigger AI responses from their phone via Telegram, without needing a laptop running.

## Solution

1. Deploy the app to Railway (already Railway-ready)
2. Add a Telegram bot that runs inside the same Railway process, providing a phone-friendly entry point for the full message log/AI workflow

---

## Part 1 — Railway Deployment

### What Changes

No code changes. The app is already fully configured:
- `railway.json` with Dockerfile builder, health check at `/health`, restart policy
- `Dockerfile` present
- `NODE_ENV=production` path already handled in Express

### Steps Required (manual setup)

1. Create Railway account, install CLI
2. `railway init` to link project
3. Add persistent volume mounted at `/app/data` (SQLite must survive redeploys)
4. Set environment variables:
   - `SESSION_SECRET` — 64-char random string (replace dev value)
   - `ANTHROPIC_API_KEY`
   - `GROQ_API_KEY`
   - `NODE_ENV=production`
5. `railway up` or connect GitHub for auto-deploy

---

## Part 2 — Telegram Bot

### Architecture

**Approach:** Long-polling bot in the same Node process (Option A)

- New file: `server/telegram.ts`
- Started from `server/index.ts` alongside Express
- Shares `db` module directly — no HTTP round-trips
- Reuses existing AI logic from `server/index.ts` (extracted to shared helpers)

### Authentication

Personal-use approach via three env vars:

| Var | Purpose |
|-----|---------|
| `TELEGRAM_BOT_TOKEN` | From BotFather |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID — bot rejects all other senders |
| `TELEGRAM_USER_EMAIL` | Your app account email — bot acts as this user |

No DB schema changes. The bot verifies `chat_id` on every message before processing.

### Bot Commands

| Input | Action |
|-------|--------|
| `@ClientName: their message` | Logs client message; fuzzy-matches or creates client; sets active client |
| `/respond` | Generates AI draft response for active client |
| `/improve your draft text` | Improves provided draft in context of active client thread |
| `/log` | Logs the last generated response as a sent "me" message |
| `/clients` | Lists all clients |
| `/help` | Shows command reference |

### Conversation State

The bot tracks "active client" in memory (last client addressed via `@Name:`). `/respond`, `/improve`, and `/log` all operate on this active client. State resets if the server restarts — user must re-address `@Name:` to re-establish context.

### Client Matching

When parsing `@Name:`, the bot:
1. Case-insensitive exact match against existing client names
2. If no match: creates a new client with that name
3. Confirms to user: "Logged for Sarah ✓" or "Created new client: Sarah ✓"

### Data Flow

```
Telegram message → verify chat_id → parse command
  → @Name: msg  → clients.findOrCreate() → messages.create(clientId, 'client', text)
  → /respond    → ai.respond(user, client) → bot.sendMessage(draft)
  → /improve X  → ai.improve(user, client, X) → bot.sendMessage(improved)
  → /log        → messages.create(clientId, 'me', lastDraft)
```

### AI Logic Refactor

The AI prompt/call logic currently lives inline in Express route handlers. To share with the Telegram bot without code duplication, extract to `server/ai.ts`:

- `generateResponse(user, client, messages): Promise<string>`
- `improveMessage(user, client, messages, draft): Promise<string>`

Both Express routes and the Telegram bot call these functions.

### New Dependencies

- `node-telegram-bot-api` — Telegram Bot API client
- `@types/node-telegram-bot-api` — TypeScript types

### New Environment Variables

```env
TELEGRAM_BOT_TOKEN=<from BotFather>
TELEGRAM_CHAT_ID=<your numeric chat ID>
TELEGRAM_USER_EMAIL=<your app account email>
```

### Error Handling

- Unknown commands → "Unknown command. Try /help"
- No active client for /respond or /improve → "No active client. Send @ClientName: message first"
- AI unavailable (no API key) → "AI unavailable — ANTHROPIC_API_KEY not set"
- Telegram disabled (no bot token) → bot silently skips startup, no crash

---

## Out of Scope

- Multi-user Telegram support
- Telegram groups/topics per client
- Webhook mode (polling is sufficient for personal use)
- Usage limit enforcement via Telegram (can add later)
