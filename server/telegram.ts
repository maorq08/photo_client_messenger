import TelegramBot from 'node-telegram-bot-api';
import db, { clients, messages, users, telegramLinkTokens } from './db';
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

function findOrCreateClient(
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

    const username = msg.from?.username ?? msg.from?.first_name ?? 'unknown';
    db.transaction(() => {
      telegramLinkTokens.markUsed(token);
      users.setTelegramChat(linkToken.user_id, chatId, username);
    })();

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
    send(chatId, HELP_TEXT);
  });
}
