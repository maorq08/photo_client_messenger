import TelegramBot from 'node-telegram-bot-api';
import { clients, messages, users } from './db';
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

export function findOrCreateClient(
  userId: number,
  name: string
): { client: Client; isNew: boolean } {
  const userClients = clients.findByUser(userId);
  const normalized = name.toLowerCase().trim();
  const match = userClients.find(c => c.name.toLowerCase() === normalized);
  if (match) return { client: match, isNew: false };

  // Enforce client limit before creating
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
  const startupUser = users.findByEmail(userEmail);

  if (!startupUser) {
    console.error(`⚠️  Telegram bot: no user found with email ${userEmail}`);
    return;
  }

  const userId = startupUser.id;

  const bot = new TelegramBot(token, { polling: true });

  bot.on('polling_error', (err) => {
    console.error('Telegram polling error:', err.message);
  });

  function send(chatId: number, text: string): void {
    bot.sendMessage(chatId, text).catch((err: Error) => {
      console.error(`Failed to send Telegram message to ${chatId}:`, err.message);
    });
  }

  function guard(chatId: number): boolean {
    if (chatId !== allowedChatId) {
      send(chatId, 'Unauthorized.');
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
      send(chatId, 'To log a client message use:\n@ClientName: their message\n\nOr type /help for all commands.');
      return;
    }

    const [, rawName, clientMessage] = match;
    let client: Client;
    let isNew: boolean;
    try {
      ({ client, isNew } = findOrCreateClient(userId, rawName.trim()));
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
    if (!guard(chatId)) return;

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
      const user = users.findById(userId)!;
      const clientMessages = messages.findByClient(client.id);
      const draft = await generateResponse(user, client, clientMessages);
      session.lastDraft = draft;
      send(chatId, `Draft:\n\n${draft}\n\n—\nUse /log to save as sent, or /improve <edited version>`);
    } catch {
      send(chatId, 'Failed to generate response. Try again.');
    }
  });

  bot.onText(/^\/improve (.+)$/s, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!guard(chatId)) return;

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
      const user = users.findById(userId)!;
      const clientMessages = messages.findByClient(client.id);
      const improved = await improveMessage(user, client, clientMessages, draft);
      session.lastDraft = improved;
      send(chatId, `Improved:\n\n${improved}\n\n—\nUse /log to save as sent`);
    } catch {
      send(chatId, 'Failed to improve message. Try again.');
    }
  });

  bot.onText(/^\/log$/, (msg) => {
    const chatId = msg.chat.id;
    if (!guard(chatId)) return;

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
    if (!guard(chatId)) return;

    const userClients = clients.findByUser(userId);
    if (userClients.length === 0) {
      send(chatId, 'No clients yet.\nStart with: @ClientName: their message');
      return;
    }

    const list = userClients.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    send(chatId, `Your clients:\n\n${list}`);
  });

  bot.onText(/^\/help$/, (msg) => {
    const chatId = msg.chat.id;
    if (!guard(chatId)) return;
    send(chatId, HELP_TEXT);
  });

  console.log('✅ Telegram bot started (polling)');
}
