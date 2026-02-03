# Changelog

All notable changes to the Photo Client Messenger app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-02-02

### Phase 2: Authentication, Database & Deployment Infrastructure

#### Added

##### User Authentication System
- Complete session-based authentication with secure cookies
- User signup and login with email/password
- Password hashing with bcrypt (10 rounds)
- Session storage in SQLite database
- Logout functionality with session destruction

##### Password Management
- Change password feature for logged-in users (requires current password verification)
- Forgot password flow with email-based reset tokens
- Password reset page with token validation
- Secure token generation (32-byte random hex)
- 1-hour token expiration for security
- Email integration via Resend (optional, logs to console in dev)

##### SQLite Database Migration
- Migrated from JSON file storage to SQLite (better-sqlite3)
- Schema for users, clients, messages, saved_responses, usage tracking
- Foreign key constraints with cascade deletes
- Indexed queries for performance
- Password reset tokens table

##### Usage Limits & Tiers
- Three-tier system: Free, Paid, Power users
- Monthly limits on AI features:
  - AI Respond: 20/100/500 per month
  - AI Improve: 30/150/750 per month
  - Transcribe: 10/50/200 per month
  - Clients: 5/25/unlimited
- Visual limit modal with upgrade prompts
- Automatic monthly reset

##### Cloud Deployment Infrastructure
- Multi-stage Dockerfile for production builds
- Railway deployment configuration (railway.json)
- Docker health checks
- Non-root user for container security
- Graceful shutdown handler (SIGTERM)
- Trust proxy for secure cookies behind reverse proxy
- Health check endpoint (`GET /health`)

##### Backup System
- SQLite backup script for Cloudflare R2
- Uses SQLite's backup API for consistency
- Ready for scheduled backups (cron-compatible)

##### Architecture Decision Records
- ADR-001: Cloud Hosting Selection (Railway)
- ADR-002: SQLite Persistence Strategy

#### Changed

- Server now exports database instance for health checks
- Session configuration updated for production (secure cookies, trust proxy)
- Mobile-specific instructions hidden in production mode
- .gitignore updated to exclude all database files

#### Frontend Updates

- Login page with signup/login/forgot password views
- Reset password page with token handling from URL
- Settings modal with "Security" section for password changes
- Auth context for global user state management
- Limit modal for usage warnings

### Files Added

- `server/auth.ts` - Authentication routes and middleware
- `server/db.ts` - SQLite database setup and queries
- `server/limits.ts` - Usage limit middleware and tier definitions
- `server/types.ts` - TypeScript type definitions
- `server/backup.ts` - R2 backup script (future use)
- `client/src/contexts/AuthContext.tsx` - Auth state management
- `client/src/pages/Login.tsx` - Login/signup/forgot password
- `client/src/pages/ResetPassword.tsx` - Password reset page
- `client/src/components/LimitModal.tsx` - Usage limit warnings
- `Dockerfile` - Production container build
- `.dockerignore` - Docker build exclusions
- `railway.json` - Railway deployment config
- `docs/adr/001-cloud-hosting.md` - Hosting decision record
- `docs/adr/002-sqlite-persistence.md` - Database decision record

### Environment Variables

New optional variables for production:
- `SESSION_SECRET` - Required for secure sessions
- `RESEND_API_KEY` - For password reset emails
- `EMAIL_FROM` - Sender address for reset emails
- `APP_URL` - Base URL for reset links

---

## [0.1.0] - 2026-02-02

### Phase 1: UI Improvements

#### Added

##### Copy to Clipboard Feature
- Copy button on message bubbles that appears on hover
- Clipboard icon transitions to checkmark for 2 seconds after successful copy
- Proper styling variants for both client (dark) and "me" (purple) message bubbles
- Error handling for clipboard API failures with graceful degradation
- Race condition prevention with proper timeout cleanup on component unmount

##### Enhanced Empty State
- New empty conversation state with animated floating icon (💬)
- "Start the conversation" heading for clarity
- Personalized hint text using client name to increase engagement
- Gentle bobbing animation on the icon with CSS keyframes
- Improves user experience for first-time interactions

##### Unified Message Input
- Single unified input field replacing two separate textareas
- "Client said" / "I said" toggle with pill-style button design
- Auto-switches to "I said" mode after successfully logging client message
- Smart paste detection: analyzes pasted text patterns and automatically suggests mode switch
- Toast notification when paste detection triggers a mode suggestion
- Haptic feedback on toggle interaction for mobile users
- Merged AI functionality: single "Draft Response" button generates new responses or improves existing drafts
- Quick insert button only visible in "I said" mode to reduce clutter
- Comprehensive race condition prevention with `mountedRef` pattern

##### Response Tone Configuration
- New optional `tone` field in Settings type for customization
- "Response Tone" selector in Settings modal with 5 curated presets:
  - Friendly & Casual (default)
  - Warm & Professional
  - Enthusiastic & Upbeat
  - Calm & Reassuring
  - Short & Direct
- Custom tone input field for user-defined tones
- Server prompts integrate configured tone into AI response generation
- Persistent tone preference in user settings

#### Fixed

- **Type Safety**: Fixed type inconsistency in Settings - `tone` is now properly optional (`tone?: string`)
- **Copy Button Race Condition**: Eliminated setTimeout/unmount conflicts with `mountedRef` pattern
- **Toast Notification Timing**: Fixed race condition where toasts could persist after component unmount
- **Input Mode Auto-Switch**: Mode only transitions to "I said" on successful message creation, preventing premature switches
- **Settings Save Errors**: Added visible error handling and user feedback when settings fail to save
- **Memory Leaks**: Proper cleanup of all timeouts and event listeners on component unmount

#### Changed

- Message input architecture now uses unified component with toggle instead of mode-specific textareas
- Copy button styling now matches bubble styling for visual consistency
- Empty state messaging updated to be more engaging and personalized
- Settings modal now includes tone configuration UI
- Server prompt generation now incorporates user-selected tone

### Files Modified

- `client/src/components/Conversation.tsx` - Added copy button feature and enhanced empty state
- `client/src/components/Conversation.css` - Styling for copy button and empty state animations
- `client/src/components/MessageInput.tsx` - Unified input with toggle, smart paste detection, and improved AI button
- `client/src/components/MessageInput.css` - Styling for toggle, animations, and responsive layout
- `client/src/components/SettingsModal.tsx` - Added tone selector and custom tone input
- `client/src/components/SettingsModal.css` - Styling for tone configuration UI
- `client/src/types.ts` - Added optional `tone` field to Settings type
- `server/index.ts` - Updated AI prompt generation to use configured tone

### Quality Assurance

All changes have been reviewed for:
- Type safety and TypeScript compliance
- Memory leak prevention (proper cleanup on unmount)
- Race condition elimination (timeout and state update safety)
- Cross-browser clipboard API compatibility
- Responsive design across mobile and desktop
- Performance impact from new features (animations are GPU-accelerated)
- Error handling and user feedback mechanisms

### Migration Notes

- Users upgrading from previous versions will receive the default tone ("Friendly & Casual")
- No breaking changes to existing data structures
- All features are backward compatible

---

## Future Roadmap

- [ ] Phase 2: AI Response Refinement
- [ ] Phase 3: Enhanced Analytics
- [ ] Phase 4: Conversation History & Search
