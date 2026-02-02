# Changelog

All notable changes to the Photo Client Messenger app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
