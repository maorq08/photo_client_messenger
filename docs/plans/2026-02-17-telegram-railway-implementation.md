# Railway Deployment + Telegram Bot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy the app to Railway and add a Telegram bot entry point so the user can log client messages and trigger AI responses from their phone.

**Architecture:** A new `server/ai.ts` module extracts the shared AI logic; a new `server/telegram.ts` module starts a long-polling Telegram bot alongside Express in the same process; three env vars (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_USER_EMAIL`) lock the bot to the owner's account.

**Tech Stack:** Node.js + TypeScript + Express (existing), `node-telegram-bot-api`, Railway, Anthropic SDK (existing)

**Design doc:** `docs/plans/2026-02-17-telegram-railway-design.md`

---

## Task 1: Install Telegram bot dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (auto-updated)

**Step 1: Install the package**

```bash
npm install node-telegram-bot-api
npm install --save-dev @types/node-telegram-bot-api
```

**Step 2: Verify it's in package.json**

Check `package.json` — `node-telegram-bot-api` should appear in `dependencies` and `@types/node-telegram-bot-api` in `devDependencies`.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add node-telegram-bot-api dependency"
```

---

## Task 2: Extract AI logic into server/ai.ts

Currently, the Anthropic call logic is duplicated inline in two Express routes in `server/index.ts` (lines ~277–398). Extract it so both the Express routes and the Telegram bot can share it without duplication.

**Files:**
- Create: `server/ai.ts`
- Modify: `server/index.ts` (lines 267–398 — remove inline Anthropic logic, import from ai.ts)

**Step 1: Create `server/ai.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { User, Client, Message } from './types';

let anthropic: Anthropic | null = null;

export function initAI(): void {
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic();
  }
}

export function isAIAvailable(): boolean {
  return !!anthropic;
}

export async function generateResponse(
  user: User,
  client: Client,
  clientMessages: Message[]
): Promise<string> {
  if (!anthropic) throw new Error('AI not available');

  const conversationHistory = clientMessages
    .map(m => `${m.sender === 'client' ? client.name : user.name}: ${m.text}`)
    .join('\n\n');

  const tone = user.tone || 'friendly and casual';
  const systemPrompt = `You are helping ${user.name}, a ${user.specialty}, write responses to clients.

About ${user.name}: ${user.notes}

${client.notes ? `About this client (${client.name}): ${client.notes}` : ''}

IMPORTANT: Write in a ${tone} tone. Match this style throughout the response.

The response should sound like it's coming from a real person who loves their work. Don't use corporate jargon.

Just write the response text - no greeting prefix needed unless contextually appropriate.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Here's my conversation history with ${client.name}:\n\n${conversationHistory}\n\nPlease write a friendly response to continue this conversation.`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  return textContent?.text || '';
}

export async function improveMessage(
  user: User,
  client: Client,
  clientMessages: Message[],
  draft: string
): Promise<string> {
  if (!anthropic) throw new Error('AI not available');

  const conversationHistory = clientMessages
    .map(m => `${m.sender === 'client' ? client.name : user.name}: ${m.text}`)
    .join('\n\n');

  const tone = user.tone || 'friendly and casual';
  const systemPrompt = `You are helping ${user.name}, a ${user.specialty}, improve their message.

About ${user.name}: ${user.notes}

${client.notes ? `About this client (${client.name}): ${client.notes}` : ''}

IMPORTANT: The message should have a ${tone} tone.

Take the draft message and make it:
1. Match the ${tone} tone
2. Sound natural and conversational
3. Fix any awkward phrasing
4. Keep the same meaning and intent

Just return the improved message text, nothing else.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Conversation history with ${client.name}:\n\n${conversationHistory}\n\nMy draft response:\n"${draft}"\n\nPlease improve this to sound more natural and friendly.`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  return textContent?.text || '';
}
```

**Step 2: Update `server/index.ts` — replace Anthropic setup**

Remove this block (lines ~267–271):
```typescript
// AI endpoints
const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
const anthropic = hasApiKey ? new Anthropic() : null;
```

Replace with:
```typescript
// AI endpoints
import { initAI, isAIAvailable, generateResponse, improveMessage } from './ai';
initAI();
```

Note: the `import` must go at the top of the file with the other imports, not inline. Move the import statement to the top of the file.

**Step 3: Update the `/api/ai/status` route in `server/index.ts`**

Change:
```typescript
app.get('/api/ai/status', (_req, res) => {
  res.json({ available: hasApiKey });
});
```

To:
```typescript
app.get('/api/ai/status', (_req, res) => {
  res.json({ available: isAIAvailable() });
});
```

**Step 4: Update the `/api/ai/respond` route in `server/index.ts`**

Replace the entire route handler body. The `if (!anthropic)` guard becomes `if (!isAIAvailable())`. Replace the manual Anthropic call + prompt with a call to `generateResponse`. Also remove the `usage.incrementAiRespond` call from inside the try block — keep it, just call it after `generateResponse` returns.

The updated route (lines ~277–335) becomes:

```typescript
app.post('/api/ai/respond', checkAILimit('aiRespond'), async (req, res) => {
  if (!isAIAvailable()) {
    return res.status(503).json({
      error: 'AI features require ANTHROPIC_API_KEY environment variable',
      needsApiKey: true
    });
  }

  const user = req.user as User;

  try {
    const { clientId, clientName } = req.body;
    const numericClientId = parseInt(clientId, 10);

    const client = clients.findByIdAndUser(numericClientId, user.id);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const clientMessages = messages.findByClient(numericClientId);
    const responseText = await generateResponse(user, { ...client, name: clientName }, clientMessages);

    usage.incrementAiRespond(user.id);
    res.json({ response: responseText });
  } catch (error) {
    console.error('AI respond error:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});
```

**Step 5: Update the `/api/ai/improve` route in `server/index.ts`**

Same pattern — replace the manual Anthropic call with `improveMessage`:

```typescript
app.post('/api/ai/improve', checkAILimit('aiImprove'), async (req, res) => {
  if (!isAIAvailable()) {
    return res.status(503).json({
      error: 'AI features require ANTHROPIC_API_KEY environment variable',
      needsApiKey: true
    });
  }

  const user = req.user as User;

  try {
    const { draft, clientId, clientName } = req.body;
    const numericClientId = parseInt(clientId, 10);

    const client = clients.findByIdAndUser(numericClientId, user.id);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const clientMessages = messages.findByClient(numericClientId);
    const responseText = await improveMessage(user, { ...client, name: clientName }, clientMessages, draft);

    usage.incrementAiImprove(user.id);
    res.json({ response: responseText });
  } catch (error) {
    console.error('AI improve error:', error);
    res.status(500).json({ error: 'Failed to improve message' });
  }
});
```

**Step 6: Remove the now-unused `Anthropic` import from `server/index.ts`**

Delete the line: `import Anthropic from '@anthropic-ai/sdk';`

**Step 7: Verify the server still starts**

```bash
npm run server
```

Expected: Server starts, logs `✅ AI features enabled` (if ANTHROPIC_API_KEY is set), no TypeScript errors.

**Step 8: Verify existing AI routes still work**

Open the web app, pick a client with messages, click "Generate Response". It should work exactly as before.

**Step 9: Commit**

```bash
git add server/ai.ts server/index.ts
git commit -m "refactor: extract AI logic into server/ai.ts"
```

---

## Task 3: Create server/telegram.ts

**Files:**
- Create: `server/telegram.ts`

**Step 1: Create the file**

```typescript
import TelegramBot from 'node-telegram-bot-api';
import { clients, messages, users } from './db';
import { generateResponse, improveMessage, isAIAvailable } from './ai';
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

export function findOrCreateClient(
  userId: number,
  name: string
): { client: Client; isNew: boolean } {
  const userClients = clients.findByUser(userId);
  const normalized = name.toLowerCase().trim();
  const match = userClients.find(c => c.name.toLowerCase() === normalized);
  if (match) return { client: match, isNew: false };

  const id = clients.create(userId, name.trim());
  return { client: clients.findById(id)!, isNew: true };
}

export function startTelegramBot(): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const allowedChatIdRaw = process.env.TELEGRAM_CHAT_ID;
  const userEmail = process.env.TELEGRAM_USER_EMAIL;

  if (!token) {
    console.log('ℹ️  Telegram bot disabled — set TELEGRAM_BOT_TOKEN to enable');
    return;
  }

  if (!allowedChatIdRaw || !userEmail) {
    console.log('⚠️  Telegram bot requires TELEGRAM_CHAT_ID and TELEGRAM_USER_EMAIL');
    return;
  }

  const allowedChatId = parseInt(allowedChatIdRaw, 10);
  const user = users.findByEmail(userEmail);

  if (!user) {
    console.error(`⚠️  Telegram bot: no user found with email ${userEmail}`);
    return;
  }

  const bot = new TelegramBot(token, { polling: true });

  function guard(chatId: number): boolean {
    if (chatId !== allowedChatId) {
      bot.sendMessage(chatId, 'Unauthorized.');
      return false;
    }
    return true;
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

  // Handle @ClientName: message
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!guard(chatId)) return;

    const text = msg.text?.trim();
    if (!text || text.startsWith('/')) return;

    const match = text.match(/^@([^:]+):\s*(.+)$/s);
    if (!match) {
      bot.sendMessage(chatId, 'To log a client message use:\n@ClientName: their message\n\nOr type /help for all commands.');
      return;
    }

    const [, rawName, clientMessage] = match;
    const { client, isNew } = findOrCreateClient(user.id, rawName.trim());
    messages.create(client.id, 'client', clientMessage.trim());

    const session = getSession(chatId);
    session.activeClientId = client.id;
    session.lastDraft = null;

    const prefix = isNew ? `Created new client: ${client.name}` : `Logged for ${client.name}`;
    bot.sendMessage(chatId, `${prefix} ✓\n\nUse /respond to generate a reply, or /improve <your draft>`);
  });

  bot.onText(/^\/respond$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!guard(chatId)) return;

    const session = getSession(chatId);
    if (!session.activeClientId) {
      bot.sendMessage(chatId, 'No active client. Send @ClientName: their message first.');
      return;
    }
    if (!isAIAvailable()) {
      bot.sendMessage(chatId, 'AI unavailable — ANTHROPIC_API_KEY not set.');
      return;
    }

    const client = clients.findById(session.activeClientId);
    if (!client) {
      bot.sendMessage(chatId, 'Active client not found. Send @ClientName: message to re-establish.');
      return;
    }

    await bot.sendMessage(chatId, 'Generating...');
    try {
      const clientMessages = messages.findByClient(client.id);
      const draft = await generateResponse(user, client, clientMessages);
      session.lastDraft = draft;
      bot.sendMessage(chatId, `Draft:\n\n${draft}\n\n—\nUse /log to save as sent, or /improve <edited version>`);
    } catch {
      bot.sendMessage(chatId, 'Failed to generate response. Try again.');
    }
  });

  bot.onText(/^\/improve (.+)$/s, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!guard(chatId)) return;

    const session = getSession(chatId);
    if (!session.activeClientId) {
      bot.sendMessage(chatId, 'No active client. Send @ClientName: their message first.');
      return;
    }
    if (!isAIAvailable()) {
      bot.sendMessage(chatId, 'AI unavailable — ANTHROPIC_API_KEY not set.');
      return;
    }

    const draft = match?.[1]?.trim();
    if (!draft) {
      bot.sendMessage(chatId, 'Usage: /improve your draft text here');
      return;
    }

    const client = clients.findById(session.activeClientId);
    if (!client) {
      bot.sendMessage(chatId, 'Active client not found.');
      return;
    }

    await bot.sendMessage(chatId, 'Improving...');
    try {
      const clientMessages = messages.findByClient(client.id);
      const improved = await improveMessage(user, client, clientMessages, draft);
      session.lastDraft = improved;
      bot.sendMessage(chatId, `Improved:\n\n${improved}\n\n—\nUse /log to save as sent`);
    } catch {
      bot.sendMessage(chatId, 'Failed to improve message. Try again.');
    }
  });

  bot.onText(/^\/log$/, (msg) => {
    const chatId = msg.chat.id;
    if (!guard(chatId)) return;

    const session = getSession(chatId);
    if (!session.activeClientId || !session.lastDraft) {
      bot.sendMessage(chatId, 'Nothing to log. Use /respond or /improve first.');
      return;
    }

    messages.create(session.activeClientId, 'me', session.lastDraft);
    session.lastDraft = null;
    bot.sendMessage(chatId, 'Response logged as sent ✓');
  });

  bot.onText(/^\/clients$/, (msg) => {
    const chatId = msg.chat.id;
    if (!guard(chatId)) return;

    const userClients = clients.findByUser(user.id);
    if (userClients.length === 0) {
      bot.sendMessage(chatId, 'No clients yet.\nStart with: @ClientName: their message');
      return;
    }

    const list = userClients.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    bot.sendMessage(chatId, `Your clients:\n\n${list}`);
  });

  bot.onText(/^\/help$/, (msg) => {
    const chatId = msg.chat.id;
    if (!guard(chatId)) return;
    bot.sendMessage(chatId, HELP_TEXT);
  });

  console.log('✅ Telegram bot started (polling)');
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add server/telegram.ts
git commit -m "feat: add Telegram bot module"
```

---

## Task 4: Wire Telegram bot into server/index.ts

**Files:**
- Modify: `server/index.ts`

**Step 1: Add the import near the top of `server/index.ts`** (with the other imports)

```typescript
import { startTelegramBot } from './telegram';
```

**Step 2: Call `startTelegramBot()` just before `app.listen`**

Find the line `const PORT = process.env.PORT || 3001;` and add the call just before it:

```typescript
// Start Telegram bot (no-op if TELEGRAM_BOT_TOKEN not set)
startTelegramBot();

const PORT = process.env.PORT || 3001;
```

**Step 3: Verify server starts without Telegram configured**

```bash
npm run server
```

Expected output includes:
```
ℹ️  Telegram bot disabled — set TELEGRAM_BOT_TOKEN to enable
```
No crash.

**Step 4: Commit**

```bash
git add server/index.ts
git commit -m "feat: wire Telegram bot into server startup"
```

---

## Task 5: Update .env.example

**Files:**
- Modify: `.env.example`

**Step 1: Read the current `.env.example`**

Check what's in it before editing.

**Step 2: Add the Telegram variables**

Append to `.env.example`:

```env
# Telegram Bot (optional — enables phone entry point)
# 1. Create a bot via @BotFather on Telegram, copy the token
TELEGRAM_BOT_TOKEN=

# 2. Find your chat ID: start the bot, send /start, then visit:
#    https://api.telegram.org/bot<TOKEN>/getUpdates
#    Look for "chat":{"id": <YOUR_CHAT_ID>}
TELEGRAM_CHAT_ID=

# 3. Your app login email (the bot acts as this user)
TELEGRAM_USER_EMAIL=
```

**Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: add Telegram bot env vars to .env.example"
```

---

## Task 6: Deploy to Railway

This task is mostly manual setup. No code changes.

**Prerequisites:**
- A Railway account (create at railway.app)
- Railway CLI installed: `npm install -g @railway/cli`

**Step 1: Install Railway CLI**

```bash
npm install -g @railway/cli
railway --version
```

Expected: prints a version number.

**Step 2: Log in**

```bash
railway login
```

Expected: opens browser, complete login.

**Step 3: Create the Railway project**

In the project root:
```bash
railway init
```

Choose: "Empty project", give it a name like `photo-client-messenger`.

**Step 4: Add a persistent volume in the Railway dashboard**

1. Open the project in the Railway web dashboard
2. Click your service → "Volumes" → "Add Volume"
3. Mount path: `/app/data`
4. This keeps the SQLite database alive across redeploys

**Step 5: Set environment variables in the Railway dashboard**

In the Railway web dashboard → your service → "Variables", add:

| Key | Value |
|-----|-------|
| `SESSION_SECRET` | Run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` locally to generate a 64-char hex string |
| `ANTHROPIC_API_KEY` | Your Anthropic key |
| `GROQ_API_KEY` | Your Groq key |
| `NODE_ENV` | `production` |

Do NOT set Telegram vars yet — add those in Task 7 after getting the bot token.

**Step 6: Deploy**

```bash
railway up
```

Expected: Railway builds the Docker image, deploys, prints the service URL.

**Step 7: Verify deployment**

```bash
railway open
```

Expected: opens your app URL in the browser. Log in with your account. Should work identically to local.

Also check the health endpoint: `https://<your-railway-url>/health`
Expected: `{"status":"healthy"}`

**Step 8: Note the production URL**

You'll need it in the next task for the bot. Save it somewhere.

---

## Task 7: Set up Telegram bot and connect to production

**Step 1: Create a Telegram bot**

1. Open Telegram, search for `@BotFather`
2. Send `/newbot`
3. Follow prompts — give it a name and username (e.g., `PhotoMessengerBot`)
4. Copy the bot token BotFather gives you (format: `123456:ABC-DEF...`)

**Step 2: Find your Telegram chat ID**

1. Start a conversation with your new bot (search it in Telegram, click Start)
2. Send any message to the bot
3. Visit this URL in your browser (replace `TOKEN`):
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
4. Look for `"chat":{"id": 123456789}` — that number is your chat ID

**Step 3: Add Telegram vars to Railway**

In the Railway dashboard → Variables, add:

| Key | Value |
|-----|-------|
| `TELEGRAM_BOT_TOKEN` | The token from BotFather |
| `TELEGRAM_CHAT_ID` | Your numeric chat ID |
| `TELEGRAM_USER_EMAIL` | The email you log into the app with |

**Step 4: Redeploy**

Railway will auto-redeploy when env vars change. If not:
```bash
railway up
```

**Step 5: Verify bot is running**

Check Railway logs:
```bash
railway logs
```

Expected to see: `✅ Telegram bot started (polling)`

**Step 6: Test the full bot flow**

In Telegram, send these messages to your bot in order:

1. `@TestClient: Hi, I want to book a photoshoot`
   - Expected: `Created new client: TestClient ✓` and active client set

2. `/respond`
   - Expected: `Generating...` then a draft response

3. `/improve I was thinking next weekend works`
   - Expected: `Improving...` then an improved version

4. `/log`
   - Expected: `Response logged as sent ✓`

5. `/clients`
   - Expected: list including `TestClient`

6. Open the web app and navigate to TestClient
   - Expected: both messages visible in the conversation thread

**Step 7: Test unauthorized access**

From a different Telegram account (or ask a friend), send any message to the bot.
Expected: bot replies `Unauthorized.` and does nothing.

---

## Task 8: Update local .env for development testing

**Files:**
- Modify: `.env` (local only, not committed)

**Step 1: Add your Telegram vars to local `.env`**

```env
TELEGRAM_BOT_TOKEN=<your token>
TELEGRAM_CHAT_ID=<your chat id>
TELEGRAM_USER_EMAIL=<your email>
```

**Step 2: Test locally**

```bash
npm run server
```

Expected: `✅ Telegram bot started (polling)`

Send a test message from Telegram. Verify it logs in the DB.

> Note: You cannot run both local and Railway polling at the same time — only one process can poll a bot token. Stop local server before Railway handles it, or use a separate test bot token locally.

---

## Rollback / Troubleshooting

| Problem | Fix |
|---------|-----|
| Bot starts but doesn't respond | Check `TELEGRAM_CHAT_ID` matches your actual chat ID exactly |
| `no user found with email` error in logs | `TELEGRAM_USER_EMAIL` doesn't match any registered account — register first via web app |
| `AI unavailable` in bot | `ANTHROPIC_API_KEY` not set in Railway vars |
| SQLite data lost after redeploy | Volume not attached or mounted at wrong path (must be `/app/data`) |
| Polling conflict (two instances) | Only one Railway instance should run; disable local bot when deployed |
