import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, unlinkSync, createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import { networkInterfaces } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, '..', 'data');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Allow larger payloads for audio

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '..', 'client', 'dist')));
}

// Helper functions for JSON file operations
function readJSON(filename: string) {
  try {
    return JSON.parse(readFileSync(join(dataDir, filename), 'utf-8'));
  } catch {
    return filename === 'settings.json' ? { name: '', specialty: '', notes: '', tone: 'friendly and casual', savedResponses: [] } : [];
  }
}

function writeJSON(filename: string, data: unknown) {
  writeFileSync(join(dataDir, filename), JSON.stringify(data, null, 2));
}

// Types
interface Settings {
  name: string;
  specialty: string;
  notes: string;
  tone?: string;
  savedResponses: SavedResponse[];
}

interface SavedResponse {
  id: string;
  trigger: string;
  title: string;
  text: string;
}

interface Client {
  id: string;
  name: string;
  notes: string;
}

interface Message {
  id: string;
  clientId: string;
  from: 'client' | 'me';
  text: string;
  timestamp: string;
}

// Settings endpoints
app.get('/api/settings', (_req, res) => {
  res.json(readJSON('settings.json'));
});

app.put('/api/settings', (req, res) => {
  writeJSON('settings.json', req.body);
  res.json(req.body);
});

// Clients endpoints
app.get('/api/clients', (_req, res) => {
  res.json(readJSON('clients.json'));
});

app.post('/api/clients', (req, res) => {
  const clients: Client[] = readJSON('clients.json');
  const newClient: Client = {
    id: Date.now().toString(),
    name: req.body.name,
    notes: req.body.notes || ''
  };
  clients.push(newClient);
  writeJSON('clients.json', clients);
  res.json(newClient);
});

app.put('/api/clients/:id', (req, res) => {
  const clients: Client[] = readJSON('clients.json');
  const index = clients.findIndex(c => c.id === req.params.id);
  if (index !== -1) {
    clients[index] = { ...clients[index], ...req.body };
    writeJSON('clients.json', clients);
    res.json(clients[index]);
  } else {
    res.status(404).json({ error: 'Client not found' });
  }
});

app.delete('/api/clients/:id', (req, res) => {
  let clients: Client[] = readJSON('clients.json');
  clients = clients.filter(c => c.id !== req.params.id);
  writeJSON('clients.json', clients);

  // Also delete associated messages
  let messages: Message[] = readJSON('messages.json');
  messages = messages.filter(m => m.clientId !== req.params.id);
  writeJSON('messages.json', messages);

  res.json({ success: true });
});

// Messages endpoints
app.get('/api/messages/:clientId', (req, res) => {
  const messages: Message[] = readJSON('messages.json');
  const clientMessages = messages
    .filter(m => m.clientId === req.params.clientId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  res.json(clientMessages);
});

app.post('/api/messages', (req, res) => {
  const messages: Message[] = readJSON('messages.json');
  const newMessage: Message = {
    id: Date.now().toString(),
    clientId: req.body.clientId,
    from: req.body.from,
    text: req.body.text,
    timestamp: new Date().toISOString()
  };
  messages.push(newMessage);
  writeJSON('messages.json', messages);
  res.json(newMessage);
});

// AI endpoints
const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
const anthropic = hasApiKey ? new Anthropic() : null;

const hasGroqKey = !!process.env.GROQ_API_KEY;
const groq = hasGroqKey ? new Groq() : null;

app.get('/api/ai/status', (_req, res) => {
  res.json({ available: hasApiKey });
});

app.post('/api/ai/respond', async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({
      error: 'AI features require ANTHROPIC_API_KEY environment variable',
      needsApiKey: true
    });
  }
  try {
    const { clientId, clientName } = req.body;
    const settings: Settings = readJSON('settings.json');
    const messages: Message[] = readJSON('messages.json');
    const clients: Client[] = readJSON('clients.json');

    const client = clients.find(c => c.id === clientId);
    const clientMessages = messages
      .filter(m => m.clientId === clientId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const conversationHistory = clientMessages
      .map(m => `${m.from === 'client' ? clientName : settings.name}: ${m.text}`)
      .join('\n\n');

    const tone = settings.tone || 'friendly and casual';
    const systemPrompt = `You are helping ${settings.name}, a ${settings.specialty}, write responses to clients.

About ${settings.name}: ${settings.notes}

${client?.notes ? `About this client (${clientName}): ${client.notes}` : ''}

IMPORTANT: Write in a ${tone} tone. Match this style throughout the response.

The response should sound like it's coming from a real person who loves their work. Don't use corporate jargon.

Just write the response text - no greeting prefix needed unless contextually appropriate.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Here's my conversation history with ${clientName}:\n\n${conversationHistory}\n\nPlease write a friendly response to continue this conversation.`
      }]
    });

    const textContent = response.content.find(c => c.type === 'text');
    res.json({ response: textContent?.text || '' });
  } catch (error) {
    console.error('AI respond error:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

app.post('/api/ai/improve', async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({
      error: 'AI features require ANTHROPIC_API_KEY environment variable',
      needsApiKey: true
    });
  }
  try {
    const { draft, clientId, clientName } = req.body;
    const settings: Settings = readJSON('settings.json');
    const messages: Message[] = readJSON('messages.json');
    const clients: Client[] = readJSON('clients.json');

    const client = clients.find(c => c.id === clientId);
    const clientMessages = messages
      .filter(m => m.clientId === clientId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const conversationHistory = clientMessages
      .map(m => `${m.from === 'client' ? clientName : settings.name}: ${m.text}`)
      .join('\n\n');

    const tone = settings.tone || 'friendly and casual';
    const systemPrompt = `You are helping ${settings.name}, a ${settings.specialty}, improve their message.

About ${settings.name}: ${settings.notes}

${client?.notes ? `About this client (${clientName}): ${client.notes}` : ''}

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
        content: `Conversation history with ${clientName}:\n\n${conversationHistory}\n\nMy draft response:\n"${draft}"\n\nPlease improve this to sound more natural and friendly.`
      }]
    });

    const textContent = response.content.find(c => c.type === 'text');
    res.json({ response: textContent?.text || '' });
  } catch (error) {
    console.error('AI improve error:', error);
    res.status(500).json({ error: 'Failed to improve message' });
  }
});

// Audio transcription endpoint using Groq Whisper
app.post('/api/ai/transcribe', async (req, res) => {
  if (!groq) {
    return res.status(503).json({
      error: 'Voice transcription requires GROQ_API_KEY environment variable',
      needsApiKey: true
    });
  }
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  const localIP = getLocalIP();
  console.log(`\n🎯 Photo Client Messenger Backend`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Local:   http://localhost:${PORT}`);
  console.log(`Network: http://${localIP}:${PORT}`);
  if (!hasApiKey) {
    console.log(`\n⚠️  AI features disabled - set ANTHROPIC_API_KEY to enable`);
  } else {
    console.log(`\n✅ AI features enabled`);
  }
  if (!hasGroqKey) {
    console.log(`⚠️  Voice input disabled - set GROQ_API_KEY to enable`);
  } else {
    console.log(`✅ Voice input enabled (Groq Whisper)`);
  }
  const VITE_PORT = process.env.VITE_PORT || 5173;
  console.log(`\n📱 To use on iPhone:`);
  console.log(`   1. Connect to the same WiFi`);
  console.log(`   2. Open Safari: http://${localIP}:${VITE_PORT}`);
  console.log(`   3. Tap Share → Add to Home Screen`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});
