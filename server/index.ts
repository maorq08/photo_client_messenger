import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import { writeFileSync, unlinkSync, createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Groq from 'groq-sdk';
import { initAI, isAIAvailable, generateResponse, improveMessage } from './ai';
import { startTelegramBot } from './telegram';
import { networkInterfaces } from 'os';

import db, { users, savedResponses, clients, messages, usage } from './db';
import authRouter, { requireAuth } from './auth';
import { PLAN_LIMITS, checkClientLimit, checkMessageLimit, checkAILimit } from './limits';
import type { User } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, '..', 'data');

const app = express();

// Trust proxy (required for secure cookies behind Railway's reverse proxy)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// CORS configuration - allow credentials for session cookies
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? true
    : ['http://localhost:5173', 'http://127.0.0.1:5173', /^http:\/\/192\.168\.\d+\.\d+:5173$/],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' })); // Allow larger payloads for audio

// Session configuration
const SQLiteStore = connectSqlite3(session);
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: dataDir,
  }) as session.Store,
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: 'lax',
  },
}));

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '..', 'client', 'dist')));
}

// Health check endpoint (before auth middleware)
app.get('/health', (_req, res) => {
  try {
    // Quick DB check
    db.prepare('SELECT 1').get();
    res.json({ status: 'healthy' });
  } catch {
    res.status(503).json({ status: 'unhealthy' });
  }
});

// Auth routes (unprotected)
app.use('/api/auth', authRouter);

// All other /api routes require authentication
app.use('/api', requireAuth);

// Settings endpoints
app.get('/api/settings', (req, res) => {
  const user = req.user as User;
  const responses = savedResponses.findByUser(user.id);

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

app.put('/api/settings', (req, res) => {
  const user = req.user as User;
  const { name, specialty, notes, tone, savedResponses: newResponses } = req.body;

  // Update user profile
  users.update(user.id, { name, specialty, notes, tone });

  // Replace saved responses
  if (Array.isArray(newResponses)) {
    savedResponses.replaceAll(user.id, newResponses.map((r: { trigger?: string; title: string; text: string }) => ({
      trigger: r.trigger || '',
      title: r.title,
      text: r.text,
    })));
  }

  // Return updated settings
  const updatedUser = users.findById(user.id)!;
  const responses = savedResponses.findByUser(user.id);

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
});

// Clients endpoints
app.get('/api/clients', (req, res) => {
  const user = req.user as User;
  const userClients = clients.findByUser(user.id);

  res.json(userClients.map(c => ({
    id: String(c.id),
    name: c.name,
    notes: c.notes,
  })));
});

app.post('/api/clients', checkClientLimit, (req, res) => {
  const user = req.user as User;
  const { name, notes } = req.body;

  const clientId = clients.create(user.id, name, notes || '');
  const client = clients.findById(clientId)!;

  res.json({
    id: String(client.id),
    name: client.name,
    notes: client.notes,
  });
});

app.put('/api/clients/:id', (req, res) => {
  const user = req.user as User;
  const clientId = parseInt(req.params.id, 10);

  const client = clients.findByIdAndUser(clientId, user.id);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  clients.update(clientId, user.id, {
    name: req.body.name ?? client.name,
    notes: req.body.notes ?? client.notes,
  });

  const updated = clients.findById(clientId)!;
  res.json({
    id: String(updated.id),
    name: updated.name,
    notes: updated.notes,
  });
});

app.delete('/api/clients/:id', (req, res) => {
  const user = req.user as User;
  const clientId = parseInt(req.params.id, 10);

  const client = clients.findByIdAndUser(clientId, user.id);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  // Messages are cascade-deleted by foreign key
  clients.delete(clientId, user.id);
  res.json({ success: true });
});

// Messages endpoints
app.get('/api/messages/:clientId', (req, res) => {
  const user = req.user as User;
  const clientId = parseInt(req.params.clientId, 10);

  // Verify client belongs to user
  const client = clients.findByIdAndUser(clientId, user.id);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const clientMessages = messages.findByClient(clientId);

  res.json(clientMessages.map(m => ({
    id: String(m.id),
    clientId: String(m.client_id),
    from: m.sender,
    text: m.text,
    timestamp: m.timestamp,
  })));
});

app.post('/api/messages', checkMessageLimit, (req, res) => {
  const user = req.user as User;
  const { clientId, from, text } = req.body;
  const numericClientId = parseInt(clientId, 10);

  // Verify client belongs to user (already done in checkMessageLimit, but be safe)
  const client = clients.findByIdAndUser(numericClientId, user.id);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const messageId = messages.create(numericClientId, from, text);
  const message = messages.findByClient(numericClientId).find(m => m.id === messageId)!;

  res.json({
    id: String(message.id),
    clientId: String(message.client_id),
    from: message.sender,
    text: message.text,
    timestamp: message.timestamp,
  });
});

// Usage endpoint
app.get('/api/usage', (req, res) => {
  const user = req.user as User;
  const limits = PLAN_LIMITS[user.plan];
  const currentUsage = usage.get(user.id);
  const clientCount = clients.countByUser(user.id);

  res.json({
    aiRespond: {
      current: currentUsage.ai_respond_count,
      limit: limits.aiRespond,
    },
    aiImprove: {
      current: currentUsage.ai_improve_count,
      limit: limits.aiImprove,
    },
    transcribe: {
      current: currentUsage.transcribe_count,
      limit: limits.transcribe,
    },
    clients: {
      current: clientCount,
      limit: limits.clients,
    },
    resetDate: usage.getNextMonthStart(),
  });
});

// AI endpoints
initAI();

const hasGroqKey = !!process.env.GROQ_API_KEY;
const groq = hasGroqKey ? new Groq() : null;

app.get('/api/ai/status', (_req, res) => {
  res.json({ available: isAIAvailable() });
});

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

// Audio transcription endpoint using Groq Whisper
app.post('/api/ai/transcribe', checkAILimit('transcribe'), async (req, res) => {
  if (!groq) {
    return res.status(503).json({
      error: 'Voice transcription requires GROQ_API_KEY environment variable',
      needsApiKey: true
    });
  }

  const user = req.user as User;

  try {
    const { audio, mimeType } = req.body;

    if (!audio) {
      return res.status(400).json({ error: 'No audio data provided' });
    }

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audio, 'base64');

    // Determine file extension from mime type
    const ext = mimeType?.includes('mp4') ? 'mp4' : 'webm';
    const tempFile = join(dataDir, `temp_audio_${Date.now()}.${ext}`);

    // Write to temp file
    writeFileSync(tempFile, audioBuffer);

    try {
      // Use Groq's Whisper for transcription
      console.log('Sending audio to Groq, file:', tempFile);
      const transcription = await groq.audio.transcriptions.create({
        file: createReadStream(tempFile),
        model: 'whisper-large-v3',
        response_format: 'json',
        language: 'en'
      });

      // Increment usage after successful transcription
      usage.incrementTranscribe(user.id);

      console.log('Groq response:', JSON.stringify(transcription));
      res.json({ transcript: transcription.text || '' });
    } finally {
      // Clean up temp file
      try {
        unlinkSync(tempFile);
      } catch {}
    }
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

// Get local IP for mobile access
function getLocalIP(): string {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Start Telegram bot (no-op if TELEGRAM_BOT_TOKEN not set)
startTelegramBot();

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  const localIP = getLocalIP();
  console.log(`\n🎯 Photo Client Messenger Backend`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Local:   http://localhost:${PORT}`);
  console.log(`Network: http://${localIP}:${PORT}`);
  if (!isAIAvailable()) {
    console.log(`\n⚠️  AI features disabled - set ANTHROPIC_API_KEY to enable`);
  } else {
    console.log(`\n✅ AI features enabled`);
  }
  if (!hasGroqKey) {
    console.log(`⚠️  Voice input disabled - set GROQ_API_KEY to enable`);
  } else {
    console.log(`✅ Voice input enabled (Groq Whisper)`);
  }
  if (process.env.NODE_ENV !== 'production') {
    const VITE_PORT = process.env.VITE_PORT || 5173;
    console.log(`\n📱 To use on iPhone:`);
    console.log(`   1. Connect to the same WiFi`);
    console.log(`   2. Open Safari: http://${localIP}:${VITE_PORT}`);
    console.log(`   3. Tap Share → Add to Home Screen`);
  }
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed');
    db.close();
    console.log('Database connection closed');
    process.exit(0);
  });
});
