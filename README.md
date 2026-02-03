# Photo Client Messenger

> AI-powered messaging assistant for photographers who want to spend less time on client communication and more time behind the lens.

[![GitHub License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.2-61dafb.svg)](https://react.dev/)
[![Express.js](https://img.shields.io/badge/Express-4.18-90c53f.svg)](https://expressjs.com/)

---

## The Problem

Photographers juggle multiple messaging platforms:
- Instagram DMs
- Email inquiries
- WhatsApp client messages
- Facebook Messenger

Every platform has different tones, contexts, and histories scattered everywhere. **Your responses should sound like you—not a bot.**

---

## The Solution

**Photo Client Messenger** centralizes your client conversations and uses AI to generate responses that match *your* personal communication style.

No more switching between apps. No more generic automated responses. Just honest, authentic client conversations—faster.

---

## Key Features

### 📱 Unified Input
Single textarea with smart "Client said / I said" toggle. Copy-paste conversations from any platform—lightning fast.

### 🧠 Smart Paste Detection
Automatically detects whether pasted text is from a client or your response. No manual sorting needed.

### ✨ AI Draft Responses
Generate new responses OR improve your draft with one click. Learns your tone over time.

### 🎨 Customizable Tone
Set your communication style:
- Casual & friendly
- Professional & formal
- Enthusiastic & energetic
- (or create your own)

### 💾 Saved Responses
Quick-insert templates for common questions:
- Pricing inquiries
- Booking availability
- Turnaround times
- Session details

### 🎤 Voice Input
Speak instead of type. Hands-free logging while you're reviewing photos or on the go.

### 📋 Copy to Clipboard
One-click copy any message to paste directly into your messaging app of choice.

### 📲 Mobile-Friendly PWA
Install on your phone, tablet, or desktop. Works offline. Syncs seamlessly.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | React 18 + TypeScript |
| **Build Tool** | Vite |
| **Backend** | Express.js |
| **AI/LLM** | Anthropic Claude API |
| **Voice Transcription** | Groq Whisper |
| **Progressive Web App** | vite-plugin-pwa |

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- API Keys:
  - [Anthropic Claude API](https://console.anthropic.com)
  - [Groq API](https://console.groq.com)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/maorq08/photo_client_messenger.git
   cd photo_client_messenger
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

4. **Add your API keys** to `.env`
   ```env
   ANTHROPIC_API_KEY=your_claude_api_key
   GROQ_API_KEY=your_groq_api_key
   ```

### Development

Run both client and server in development mode:

```bash
npm run dev
```

This starts:
- React frontend on `http://localhost:5173`
- Express server on `http://localhost:3000`

### Production

Build and deploy:

```bash
npm run build
npm start
```

### Cloud Deployment (Railway)

This app is configured for one-click deployment to [Railway](https://railway.app):

1. **Create Railway account** and install CLI
2. **Initialize project**: `railway init`
3. **Add persistent volume** mounted at `/app/data` (for SQLite)
4. **Set environment variables**:
   ```
   SESSION_SECRET=<64-char-random-string>
   ANTHROPIC_API_KEY=sk-ant-...
   GROQ_API_KEY=gsk_...
   ```
5. **Deploy**: `railway up` or connect GitHub for auto-deploy

See `docs/adr/001-cloud-hosting.md` for architecture decisions.

---

## Usage Workflow

### The Typical Session

1. **Paste a conversation** - Copy-paste from Instagram DMs, email, WhatsApp, wherever
2. **Label the speakers** - Toggle "Client said / I said" (or let AI detect it)
3. **Click "Generate Response"** - Get 2-3 options in your voice
4. **Pick one** - Or edit and refine before sending
5. **Copy to clipboard** - Paste directly into your messaging app
6. **Done** - Logged, saved, and ready for future reference

---

## Project Structure

```
photo_client_messenger/
├── client/                 # React TypeScript frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── App.tsx         # Main app component
│   │   └── main.tsx        # Entry point
│   └── package.json
├── server/                 # Express.js backend
│   ├── index.ts            # Server setup & routes
│   └── package.json
├── data/                   # Persisted conversation data
├── .env.example            # Environment variables template
└── package.json            # Root package.json with scripts
```

---

## API Endpoints

### Messages
- `POST /api/messages` - Save a new message/conversation
- `GET /api/messages` - Retrieve all saved conversations

### AI
- `POST /api/generate-response` - Generate AI response
  ```json
  {
    "clientMessage": "string",
    "tone": "casual|professional|enthusiastic",
    "conversationContext": "string (optional)"
  }
  ```

### Voice
- `POST /api/transcribe` - Transcribe audio to text
  ```
  multipart/form-data with audio file
  ```

---

## Configuration

### Customize Your Tone

Edit your tone profile in the app settings:

```json
{
  "tone": "casual",
  "style": "conversational but professional",
  "examples": [
    "Love your vibe! Let's make this session amazing.",
    "Absolutely! Check out our package options below."
  ]
}
```

The AI learns from your examples and generates similar responses.

---

## Browser Support

- Chrome/Chromium 90+
- Firefox 88+
- Safari 15+
- Edge 90+

PWA installation supported on all modern browsers.

---

## Privacy & Data

- All conversations stored locally (default)
- Optional cloud sync (coming soon)
- No data shared with third parties
- API keys stored locally only
- Anthropic processes messages per their [Privacy Policy](https://www.anthropic.com/privacy)

---

## Contributing

Love this project? We're open source and welcome contributions!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Roadmap

- [x] Core messaging UI
- [x] AI response generation
- [x] Voice input support
- [x] Saved responses library
- [x] User authentication
- [x] SQLite database
- [x] Cloud deployment (Railway)
- [ ] Multi-language support
- [ ] Custom AI model training
- [ ] Team collaboration features
- [ ] Analytics & insights dashboard

---

## Support

Have questions or feedback? Open an issue or start a discussion on GitHub.

**Email:** [your contact info]
**Twitter:** [@your_handle]
**Portfolio:** [your website]

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- Built with [React](https://react.dev/) and [Vite](https://vitejs.dev/)
- AI powered by [Anthropic Claude](https://www.anthropic.com/)
- Voice transcription by [Groq](https://groq.com/)
- Inspired by the needs of real photographers

---

**Made with ❤️ for photographers everywhere.**

---

*For photographers, by photographers. Because client communication shouldn't get in the way of creativity.*
