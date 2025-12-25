# EmailVerse 2.0: Implementation Plan

## Overview

This document details the implementation path for the multi-viewport architecture described in NORTH_STAR_2.md. The approach is **extension, not rewrite**—we build on the existing backend while adding the viewport abstraction layer.

---

## Architecture Summary

```
Frontend (New)                    Backend (Existing + Extensions)
─────────────────                 ─────────────────────────────────

┌─────────────────┐              ┌─────────────────────────────────┐
│   Viewport      │   REST/WS   │      Viewport Adapter Layer     │
│   Shell         │◄───────────►│  (transforms events to formats) │
│                 │              └─────────────┬───────────────────┘
│ ┌─────────────┐ │                            │
│ │   Archive   │ │              ┌─────────────┴───────────────────┐
│ │    View     │ │              │       Event Subscription        │
│ └─────────────┘ │              │    (real-time event stream)     │
│ ┌─────────────┐ │              └─────────────┬───────────────────┘
│ │  Research   │ │                            │
│ │    View     │ │              ┌─────────────┴───────────────────┐
│ └─────────────┘ │              │        World State API          │
│ ┌─────────────┐ │              │   (characters, tensions, etc)   │
│ │    Live     │ │              └─────────────┬───────────────────┘
│ │    View     │ │                            │
│ └─────────────┘ │              ┌─────────────┴───────────────────┐
│ ┌─────────────┐ │              │     Existing Backend Stack      │
│ │   Audio     │ │              │  (simulation, models, storage)  │
│ │    View     │ │              └─────────────────────────────────┘
│ └─────────────┘ │
└─────────────────┘
```

---

## Phase 1.5: Foundation Layer

**Goal**: Build the shared infrastructure that all viewports depend on.

### 1.5.1: Event System (Backend)

Create an event subscription system that viewports can use.

**File**: `src/events/emitter.ts`

```typescript
// Event types emitted by the world
type WorldEventType =
  | 'email_generated'
  | 'thread_created'
  | 'thread_updated'
  | 'character_spoke'
  | 'tension_escalated'
  | 'tension_resolved'
  | 'document_referenced'
  | 'simulation_tick'
  | 'generation_progress';

interface WorldEvent {
  id: string;
  type: WorldEventType;
  timestamp: Date;
  payload: unknown;
  universeId: string;
}

interface EventEmitter {
  emit(event: WorldEvent): void;
  subscribe(filter: EventFilter, callback: (event: WorldEvent) => void): Unsubscribe;
  getHistory(universeId: string, since?: Date): WorldEvent[];
}

// In-memory implementation for local, Durable Objects for Cloudflare
```

**File**: `src/events/filters.ts`

```typescript
interface EventFilter {
  types?: WorldEventType[];
  universeId: string;
  characterIds?: string[];
  threadIds?: string[];
  since?: Date;
}

// Viewport-specific filters
const archiveFilter: EventFilter = {
  types: ['email_generated', 'thread_created', 'thread_updated'],
  universeId: '*',
};

const liveFilter: EventFilter = {
  types: ['character_spoke', 'tension_escalated', 'simulation_tick'],
  universeId: '*',
};
```

**Tasks**:
- [ ] Create `src/events/emitter.ts` with EventEmitter interface
- [ ] Create `src/events/filters.ts` with viewport-specific filters
- [ ] Create `src/events/memory-emitter.ts` for local development
- [ ] Integrate event emission into tick engine
- [ ] Add event history storage to SQLite

### 1.5.2: Viewport Adapter Interface (Backend)

Define how viewports interact with world state.

**File**: `src/viewports/adapter.ts`

```typescript
interface ViewportAdapter {
  id: ViewportId;
  name: string;

  // What events this viewport cares about
  eventFilter: EventFilter;

  // Transform a world event into viewport-specific content
  transformEvent(event: WorldEvent, context: ViewportContext): ViewportContent;

  // Handle user interaction, return world event if it affects state
  handleInteraction(interaction: UserInteraction): WorldEvent | null;

  // Viewport-specific prompt modifications for generation
  getGenerationContext(character: Character, event: WorldEvent): GenerationContext;
}

type ViewportId = 'archive' | 'research' | 'live' | 'audio';

interface ViewportContent {
  viewportId: ViewportId;
  contentType: string;
  data: unknown;
  renderHints: RenderHints;
}

interface RenderHints {
  priority: 'high' | 'medium' | 'low';
  animate: boolean;
  soundEffect?: string;
}
```

**Tasks**:
- [ ] Create `src/viewports/adapter.ts` with interface definitions
- [ ] Create `src/viewports/archive-adapter.ts`
- [ ] Create `src/viewports/research-adapter.ts` (stub)
- [ ] Create `src/viewports/live-adapter.ts` (stub)
- [ ] Create `src/viewports/audio-adapter.ts` (stub)
- [ ] Create `src/viewports/registry.ts` for viewport registration

### 1.5.3: Shared Component Library (Frontend)

Web Components that work across all viewports.

**File Structure**:
```
src/ui/
├── components/
│   ├── ev-character-avatar.ts
│   ├── ev-message-bubble.ts
│   ├── ev-timestamp.ts
│   ├── ev-tension-indicator.ts
│   ├── ev-document-reference.ts
│   ├── ev-thread-preview.ts
│   ├── ev-loading-state.ts
│   └── ev-error-state.ts
├── viewports/
│   ├── ev-viewport-shell.ts
│   ├── ev-archive-view.ts
│   ├── ev-research-view.ts
│   ├── ev-live-view.ts
│   └── ev-audio-view.ts
├── styles/
│   ├── tokens.css
│   ├── archive-theme.css
│   ├── research-theme.css
│   └── live-theme.css
└── index.ts
```

**Core Components**:

```typescript
// ev-character-avatar.ts
class EVCharacterAvatar extends HTMLElement {
  static observedAttributes = ['character-id', 'size', 'show-status'];

  // Renders character avatar with optional online status
  // Falls back to initials if no image
  // Color-coded by model binding (subtle)
}

// ev-message-bubble.ts
class EVMessageBubble extends HTMLElement {
  static observedAttributes = ['sender-id', 'timestamp', 'type'];

  // Renders message with sender attribution
  // Supports: email, chat, annotation, audio-transcript
  // Handles document references inline
}

// ev-tension-indicator.ts
class EVTensionIndicator extends HTMLElement {
  static observedAttributes = ['tension-id', 'intensity', 'status'];

  // Visual indicator of tension level
  // Animates on escalation
  // Click to see tension details
}

// ev-viewport-shell.ts
class EVViewportShell extends HTMLElement {
  // Container that handles viewport switching
  // Manages shared state across viewports
  // Handles navigation and deep linking
}
```

**Tasks**:
- [ ] Set up `src/ui/` directory structure
- [ ] Create design tokens CSS (`tokens.css`)
- [ ] Implement `ev-character-avatar`
- [ ] Implement `ev-message-bubble`
- [ ] Implement `ev-timestamp`
- [ ] Implement `ev-tension-indicator`
- [ ] Implement `ev-document-reference`
- [ ] Implement `ev-loading-state`
- [ ] Implement `ev-error-state`
- [ ] Implement `ev-viewport-shell`
- [ ] Create component documentation

### 1.5.4: API Extensions (Backend)

New endpoints for viewport-aware interactions.

**New Endpoints**:

```typescript
// Real-time event stream
GET /api/universe/{id}/events/stream
// → Server-Sent Events stream of WorldEvents

// Viewport-specific content
GET /api/universe/{id}/viewport/{viewportId}
// → Initial state for viewport

// On-demand generation (Research View)
POST /api/universe/{id}/generate/reaction
Body: { characterId, passageId, question? }
// → Character's reaction to specific passage

// User interaction
POST /api/universe/{id}/interact
Body: { viewportId, interaction }
// → Process user action, return resulting events
```

**Tasks**:
- [ ] Add SSE endpoint for event streaming
- [ ] Add viewport-specific content endpoints
- [ ] Add on-demand generation endpoint
- [ ] Add user interaction endpoint
- [ ] Update API documentation

### 1.5.5: WebSocket/SSE Infrastructure

For real-time viewports (Live View primarily).

**File**: `src/api/realtime.ts`

```typescript
interface RealtimeConnection {
  universeId: string;
  sessionId: string;
  viewportId: ViewportId;
  eventFilter: EventFilter;
}

// SSE for one-way server → client
// WebSocket for bidirectional (Live View interactions)

class RealtimeManager {
  connections: Map<string, RealtimeConnection>;

  broadcast(universeId: string, event: WorldEvent): void;
  sendToSession(sessionId: string, event: WorldEvent): void;
  handleClientMessage(sessionId: string, message: ClientMessage): void;
}
```

**Tasks**:
- [ ] Create `src/api/realtime.ts`
- [ ] Implement SSE connection handling
- [ ] Implement WebSocket for Live View
- [ ] Add connection lifecycle management
- [ ] Handle reconnection gracefully

---

## Phase 2: Archive View (Complete Implementation)

**Goal**: Fully functional email client viewport.

### 2.1: Email Client Shell

**File**: `src/ui/viewports/ev-archive-view.ts`

```typescript
class EVArchiveView extends HTMLElement {
  // Main email client interface
  // Slots: sidebar, email-list, email-detail, compose

  private currentFolder: Folder = 'inbox';
  private selectedThread: Thread | null = null;
  private selectedEmail: Email | null = null;
}
```

**Sub-components**:
- `ev-archive-sidebar`: Folders, character list, tension summary
- `ev-archive-list`: Email/thread list with previews
- `ev-archive-detail`: Full email view with thread context
- `ev-archive-compose`: Reply composition (Phase 2.5)

**Tasks**:
- [ ] Implement `ev-archive-view` shell
- [ ] Implement `ev-archive-sidebar`
- [ ] Implement `ev-archive-list`
- [ ] Implement `ev-archive-detail`
- [ ] Implement thread expansion/collapse
- [ ] Implement folder filtering
- [ ] Implement search (local filter)
- [ ] Add keyboard navigation

### 2.2: Archive Visual Theme

**File**: `src/ui/styles/archive-theme.css`

```css
/* Recovered archive aesthetic */
:root {
  --archive-bg: #0a0a0a;
  --archive-text: #00ff88;
  --archive-text-dim: #007744;
  --archive-accent: #00ffcc;
  --archive-error: #ff4444;
  --archive-warning: #ffaa00;

  --scanline-opacity: 0.03;
  --glitch-probability: 0.001;
  --crt-curvature: 2px;
}

/* CRT effect overlay */
.archive-view::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 255, 136, var(--scanline-opacity)),
    rgba(0, 255, 136, var(--scanline-opacity)) 1px,
    transparent 1px,
    transparent 2px
  );
  pointer-events: none;
}

/* Corruption effect for "damaged" content */
.corrupted {
  animation: glitch 0.3s infinite;
  opacity: 0.7;
}

@keyframes glitch {
  0%, 100% { transform: translate(0); }
  20% { transform: translate(-2px, 1px); }
  40% { transform: translate(2px, -1px); }
  60% { transform: translate(-1px, 2px); }
}
```

**Tasks**:
- [ ] Create archive theme CSS
- [ ] Implement CRT/scanline effects
- [ ] Implement corruption/glitch effects
- [ ] Add monospace typography
- [ ] Create "recovery progress" animations
- [ ] Test accessibility (ensure readability)

### 2.3: Archive-Specific Features

**Corruption System**:
```typescript
// Some emails marked as "corrupted" (explains generation gaps)
interface CorruptionLevel {
  none: 0;
  minor: 1;    // Some characters replaced with ▓
  moderate: 2; // Sections missing
  severe: 3;   // Only subject visible
  total: 4;    // Entry exists but content lost
}

// Corruption adds mystery, explains imperfection
function applyCorruption(email: Email, level: CorruptionLevel): CorruptedEmail;
```

**Timeline View**:
```typescript
// See emails chronologically across all threads
// Visual timeline with tension indicators
// Click to jump to email in thread context
```

**Tasks**:
- [ ] Implement corruption display system
- [ ] Add timeline view option
- [ ] Implement character profile sidebar
- [ ] Add tension visualization
- [ ] Implement "decrypt" animation for loading

---

## Phase 3: Research View

**Goal**: NotebookLM-style document exploration with character perspectives.

### 3.1: Document Viewer Core

**File**: `src/ui/viewports/ev-research-view.ts`

```typescript
class EVResearchView extends HTMLElement {
  // Split view: document + character panel
  // Document has selectable passages
  // Character panel shows reactions/allows questions

  private currentDocument: ProcessedDocument | null;
  private selectedPassage: Passage | null;
  private activeCharacter: Character | null;
}
```

**Sub-components**:
- `ev-research-document`: PDF/text viewer with highlighting
- `ev-research-annotations`: Inline character reactions
- `ev-research-panel`: Character selection and Q&A
- `ev-research-chat`: Ask characters questions

### 3.2: Passage-to-Character Reactions

```typescript
// Backend: Generate reactions on demand
interface ReactionRequest {
  characterId: string;
  passageId: string;
  passageText: string;
  question?: string; // Optional specific question
}

interface ReactionResponse {
  characterId: string;
  reaction: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'skeptical';
  relatedKnowledge: string[]; // What the character knows that's relevant
  suggestedFollowups: string[];
}

// Cache reactions to avoid regeneration
```

**Tasks**:
- [ ] Implement `ev-research-view` shell
- [ ] Implement `ev-research-document` with text selection
- [ ] Implement passage highlighting
- [ ] Implement `ev-research-panel` for character selection
- [ ] Add on-demand reaction generation
- [ ] Implement reaction caching
- [ ] Add "ask a question" functionality
- [ ] Implement follow-up suggestions
- [ ] Link to Archive View (see related emails)

### 3.3: Research Theme

```css
:root {
  --research-bg: #1a1a2e;
  --research-text: #e0e0e0;
  --research-accent: #4a9eff;
  --research-highlight: rgba(74, 158, 255, 0.2);
  --research-panel-bg: #0f0f1a;
}

/* Clean, academic aesthetic */
/* Syntax highlighting for code passages */
/* Citation formatting */
```

---

## Phase 4: Live View

**Goal**: Real-time Discord/Slack-style conversation simulation.

### 4.1: Live View Core

**File**: `src/ui/viewports/ev-live-view.ts`

```typescript
class EVLiveView extends HTMLElement {
  // Channel-based organization
  // Real-time message stream
  // Presence indicators
  // User can participate

  private currentChannel: Channel | null;
  private messages: Message[];
  private typingIndicators: Map<CharacterId, boolean>;
}
```

**Sub-components**:
- `ev-live-sidebar`: Channel list, DMs, character presence
- `ev-live-channel`: Message stream with real-time updates
- `ev-live-message`: Individual message with reactions
- `ev-live-input`: User message composition
- `ev-live-typing`: "X is typing..." indicator

### 4.2: Real-Time Simulation

```typescript
// Backend: Continuous generation mode for Live View
interface LiveSimulationConfig {
  universeId: string;
  tickInterval: number; // Faster than batch mode
  activeCharacters: CharacterId[];
  currentTension: TensionId;
}

// Generate "typing" events before messages
// Stream messages as they're generated
// React to user messages in real-time
```

**Tasks**:
- [ ] Implement `ev-live-view` shell
- [ ] Implement WebSocket connection for real-time
- [ ] Implement channel organization
- [ ] Implement message streaming
- [ ] Add typing indicators
- [ ] Implement user participation
- [ ] Add reaction system (emoji responses)
- [ ] Implement DM view for private conversations
- [ ] Create live simulation mode in backend

### 4.3: Live Theme

```css
:root {
  --live-bg: #36393f;
  --live-text: #dcddde;
  --live-accent: #5865f2;
  --live-mention: rgba(250, 166, 26, 0.1);
  --live-online: #3ba55c;
  --live-idle: #faa61a;
  --live-offline: #747f8d;
}

/* Discord-inspired aesthetic */
/* Smooth message animations */
/* Presence indicator dots */
```

---

## Phase 5: Audio View

**Goal**: Podcast-style audio generation for character discussions.

### 5.1: Audio Generation Integration

```typescript
// Backend: Generate audio from text
interface AudioGenerationRequest {
  text: string;
  characterId: string;
  voiceConfig: VoiceConfig;
}

interface VoiceConfig {
  provider: 'elevenlabs' | 'openai-tts' | 'browser-tts';
  voiceId: string;
  speed: number;
  pitch: number;
}

// Character voice assignment (similar to model binding)
// Consistent voice per character
```

### 5.2: Audio View Core

**File**: `src/ui/viewports/ev-audio-view.ts`

```typescript
class EVAudioView extends HTMLElement {
  // Podcast-style player
  // Episode list (threads as episodes)
  // Transcript sync

  private currentEpisode: AudioEpisode | null;
  private playbackState: PlaybackState;
  private transcriptPosition: number;
}
```

**Sub-components**:
- `ev-audio-player`: Play/pause, seek, speed controls
- `ev-audio-episode-list`: Available "episodes" to listen
- `ev-audio-transcript`: Synced transcript with highlighting
- `ev-audio-waveform`: Visual waveform display

**Tasks**:
- [ ] Research TTS options (ElevenLabs, OpenAI TTS, browser native)
- [ ] Implement voice-to-character binding
- [ ] Create audio generation pipeline
- [ ] Implement `ev-audio-view` shell
- [ ] Implement audio player controls
- [ ] Implement transcript sync
- [ ] Add episode organization
- [ ] Implement audio caching

### 5.3: Audio Theme

```css
:root {
  --audio-bg: #121212;
  --audio-text: #ffffff;
  --audio-accent: #1db954;
  --audio-waveform: #1db954;
  --audio-progress: #535353;
}

/* Spotify-inspired aesthetic */
/* Waveform visualization */
/* Transcript scroll sync */
```

---

## Implementation Order

### Sprint 1: Foundation (Phase 1.5)
1. Event system (emitter, filters)
2. Viewport adapter interface
3. Core shared components (avatar, bubble, timestamp)
4. SSE endpoint for events
5. Viewport shell component

### Sprint 2: Archive View (Phase 2)
1. Archive adapter implementation
2. Archive-specific components
3. Archive theme and effects
4. Integration with existing backend
5. Full email client functionality

### Sprint 3: Research View (Phase 3)
1. Research adapter implementation
2. Document viewer component
3. On-demand reaction generation
4. Character Q&A functionality
5. Cross-linking to Archive

### Sprint 4: Live View (Phase 4)
1. Live adapter implementation
2. WebSocket infrastructure
3. Real-time message streaming
4. User participation
5. Live simulation mode

### Sprint 5: Audio View (Phase 5)
1. TTS integration
2. Voice-character binding
3. Audio generation pipeline
4. Audio player components
5. Transcript synchronization

### Sprint 6: Polish & Integration
1. Cross-viewport navigation
2. Deep linking
3. Performance optimization
4. Accessibility audit
5. Documentation

---

## File Structure (Final)

```
genMail/
├── src/
│   ├── api/
│   │   ├── server.ts          # Existing
│   │   ├── realtime.ts        # NEW: WebSocket/SSE
│   │   └── routes/
│   │       ├── universe.ts    # Existing
│   │       ├── viewport.ts    # NEW: Viewport endpoints
│   │       └── events.ts      # NEW: Event stream
│   ├── events/
│   │   ├── emitter.ts         # NEW: Event system
│   │   ├── filters.ts         # NEW: Event filters
│   │   └── memory-emitter.ts  # NEW: Local implementation
│   ├── viewports/
│   │   ├── adapter.ts         # NEW: Adapter interface
│   │   ├── registry.ts        # NEW: Viewport registry
│   │   ├── archive-adapter.ts # NEW
│   │   ├── research-adapter.ts# NEW
│   │   ├── live-adapter.ts    # NEW
│   │   └── audio-adapter.ts   # NEW
│   ├── models/                # Existing
│   ├── pipeline/              # Existing
│   ├── simulation/            # Existing
│   ├── storage/               # Existing
│   ├── types.ts               # Existing + extensions
│   └── ui/
│       ├── components/
│       │   ├── ev-character-avatar.ts
│       │   ├── ev-message-bubble.ts
│       │   ├── ev-timestamp.ts
│       │   ├── ev-tension-indicator.ts
│       │   ├── ev-document-reference.ts
│       │   ├── ev-thread-preview.ts
│       │   ├── ev-loading-state.ts
│       │   └── ev-error-state.ts
│       ├── viewports/
│       │   ├── ev-viewport-shell.ts
│       │   ├── ev-archive-view.ts
│       │   ├── ev-research-view.ts
│       │   ├── ev-live-view.ts
│       │   └── ev-audio-view.ts
│       ├── styles/
│       │   ├── tokens.css
│       │   ├── archive-theme.css
│       │   ├── research-theme.css
│       │   ├── live-theme.css
│       │   └── audio-theme.css
│       └── index.ts
├── public/
│   └── index.html             # Main entry point
├── docs/
│   ├── IMPLEMENTATION_PLAN_V2.md  # This file
│   └── components/            # Component documentation
├── NORTH_STAR_2.md            # Vision document
├── ARCHITECTURE_DECISIONS.md  # Existing
└── CLAUDE.md                  # Updated
```

---

## Success Metrics

### Phase 1.5 Complete When:
- [ ] Events flow from simulation to subscribers
- [ ] Viewport shell switches between views
- [ ] Shared components render correctly
- [ ] SSE endpoint streams events
- [ ] Archive view shows "active", others show "coming soon"

### Phase 2 Complete When:
- [ ] Full email client functionality
- [ ] Thread viewing and navigation
- [ ] Folder filtering
- [ ] CRT aesthetic applied
- [ ] Corruption effects working
- [ ] Keyboard navigation

### Phase 3 Complete When:
- [ ] Document viewer with passage selection
- [ ] Character reactions on demand
- [ ] Q&A functionality works
- [ ] Links to Archive View
- [ ] Reactions cached

### Phase 4 Complete When:
- [ ] Real-time message streaming
- [ ] Channel organization
- [ ] User can send messages
- [ ] Characters respond to user
- [ ] Typing indicators work

### Phase 5 Complete When:
- [ ] Audio generates for threads
- [ ] Voice consistent per character
- [ ] Transcript syncs with audio
- [ ] Episode organization
- [ ] Playback controls work

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| TTS costs too high | Start with browser TTS, upgrade to ElevenLabs for premium |
| Real-time too complex | Live View can use polling initially |
| Document viewer complex | Use existing PDF.js, focus on highlighting |
| Scope creep | Strict phase boundaries, "coming soon" for unbuilt views |
| Performance with many events | Event filtering, pagination, virtualization |

---

## Dependencies

**NPM Packages to Add**:
```json
{
  "pdfjs-dist": "^4.0.0",       // Document viewing
  "hono": "^4.0.0",             // Already have
  "ws": "^8.0.0",               // WebSocket (if not using Hono's)
  "@anthropic-ai/sdk": "^0.x",  // Already have
  "openai": "^4.x"              // Already have - includes TTS
}
```

**Browser APIs Used**:
- Web Components (Custom Elements, Shadow DOM)
- Server-Sent Events
- WebSocket
- Web Audio API (for audio view)
- Intersection Observer (virtualization)
- ResizeObserver (responsive layouts)

---

## Next Steps

1. **Review this plan** with user for alignment
2. **Start Sprint 1** with event system
3. **Build incrementally** with working software at each step
4. **Test each phase** before moving to next
5. **Document components** as they're built
