# EmailVerse 2.0: North Star

## The Evolution

**EmailVerse transforms documents into living narrative worlds, experienced through multiple viewports into the same simulated reality.**

The original vision—emails as windows into a simulated world—remains core. But we now recognize that email is ONE viewport, not THE viewport. The same world state, same characters, same tensions can be experienced through:

- **Archive View**: The recovered email inbox (original vision)
- **Research View**: NotebookLM-style document annotation with character reactions
- **Live View**: Discord/Slack-style real-time conversation simulation
- **Audio View**: Podcast-style generated discussions

One world. Multiple lenses. Same truth.

---

## Core Philosophy (Unchanged)

### 1. World First, Viewports Second

We don't generate emails OR chat messages OR annotations. We simulate a world where characters exist, have relationships, pursue goals, harbor secrets, and experience tensions. **Viewports are just rendering layers** on top of that world.

This matters because:
- Switch viewports, same characters know the same things
- Events in one viewport reflect in others
- The world is the source of truth, not any particular output format
- Future viewports require zero backend changes

### 2. Narrative Coherence Over Volume

A world with 8 characters and 3 rich tensions is infinitely more valuable than 20 shallow personas. Every piece of content should:
- Advance or reveal something about a tension
- Express authentic character voice
- Connect to the document source material
- Invite the user deeper into the world

### 3. Deep Characters, Bound Voices

Characters aren't templates—they're psychological entities with:
- Goals they pursue (immediate, short-term, long-term)
- Secrets they protect
- Beliefs that cause friction with others
- Emotional patterns that shape their communication
- Relationships that constrain their behavior
- **Knowledge boundaries**: They only know what WorldState says they know

Each character's voice is bound to ONE model. That model writes ALL their content across ALL viewports.

### 4. Scale-Ready by Design

The architecture handles unknown scale gracefully:
- 1 document or 100
- 8 characters or 30
- 50 emails or 500
- Single viewport or four simultaneous

No hardcoded limits. Task queues that work locally and at edge.

### 5. Viewport Agnostic Backend

The backend knows nothing about presentation. It provides:
- Characters with their knowledge and voice
- Tensions with their state and participants
- Events with their type and outcome
- Content generation via character-bound models

How that renders—email thread, chat message, audio segment, annotation—is purely frontend concern.

---

## The Four Viewports

### Archive View (The Original)

**Metaphor**: You've recovered a corrupted email archive from an alternate reality.

**Experience**:
- Familiar email client: inbox, sent, threads, folders
- CRT aesthetic with scanlines, glitch effects
- Some content "corrupted" (explains generation gaps)
- Discovery-oriented: what happened between these characters?

**Strengths**:
- Low cognitive load (everyone knows email)
- Natural organization (threads, time)
- Async nature matches generation latency
- Imperfections become features

**Best For**: Exploration, narrative discovery, first-time users

---

### Research View (The Scholar)

**Metaphor**: Your documents have been annotated by a panel of experts with different perspectives.

**Experience**:
- Document viewer with highlighted passages
- Character reaction panel on the side
- Click any passage → see what each character thinks
- Ask any character a question about the content
- On-demand generation (not batch)

**Strengths**:
- Direct utility (understand documents better)
- Interactive exploration
- Connects content to source material
- Familiar to NotebookLM users

**Best For**: Active study, research, understanding complex material

---

### Live View (The Community)

**Metaphor**: You've been added to a private Slack/Discord where insiders discuss the document.

**Experience**:
- Real-time message stream
- Multiple channels by topic
- Direct messages for private revelations
- Presence indicators ("Dr. Chen is typing...")
- React to messages, influence conversation

**Strengths**:
- Modern, engaging interface
- Real-time feel (even if simulated)
- Familiar to younger users
- Natural for debate and discussion

**Best For**: Entertainment, engagement, watching discourse unfold

---

### Audio View (The Podcast)

**Metaphor**: Listen to characters discuss the document as a podcast.

**Experience**:
- Generated audio discussions
- Multiple "episodes" covering different tensions
- Play/pause, skip, speed controls
- Transcript sync with audio
- Subscribe to character pairs

**Strengths**:
- Passive consumption (driving, walking)
- Memorable through voice
- Highly engaging format
- Subscription potential

**Best For**: Passive learning, commute time, accessibility

---

## Viewport Interoperability

The power is in the connections:

| From | To | Experience |
|------|-----|------------|
| Archive → Research | Click passage in email → see document context |
| Research → Archive | See which emails discuss this passage |
| Live → Archive | "View full thread" → opens in Archive |
| Archive → Live | "Watch this debate live" → real-time simulation |
| Any → Audio | "Listen to this thread" → generated audio |

**Characters are consistent across all views.** Dr. Chen in Archive sounds like Dr. Chen in Live sounds like Dr. Chen in Audio.

---

## The Abstraction Stack

```
┌─────────────────────────────────────────────────────┐
│                    VIEWPORTS                        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ Archive │ │Research │ │  Live   │ │  Audio  │   │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘   │
│       │           │           │           │         │
├───────┴───────────┴───────────┴───────────┴─────────┤
│              VIEWPORT ADAPTER LAYER                 │
│  - Transforms world events to viewport format       │
│  - Handles viewport-specific generation prompts     │
│  - Manages real-time vs batch rendering             │
├─────────────────────────────────────────────────────┤
│                 WORLD STATE API                     │
│  - Characters, Tensions, Events, Facts              │
│  - Content generation via character binding         │
│  - Event subscription (for real-time views)         │
├─────────────────────────────────────────────────────┤
│               SIMULATION ENGINE                     │
│  - Tick-based world evolution                       │
│  - Tension lifecycle management                     │
│  - Event planning and execution                     │
├─────────────────────────────────────────────────────┤
│                 MODEL ROUTER                        │
│  - Character-to-model binding                       │
│  - Multi-provider orchestration                     │
│  - Cost tracking and fallbacks                      │
├─────────────────────────────────────────────────────┤
│               DOCUMENT PIPELINE                     │
│  - Ingestion, chunking, extraction                  │
│  - Entity and theme detection                       │
│  - Tension identification                           │
├─────────────────────────────────────────────────────┤
│                   STORAGE                           │
│  - SQLite (local) / D1 (production)                 │
│  - Sessions, Universes, Documents, Characters       │
└─────────────────────────────────────────────────────┘
```

---

## What Success Looks Like

### Phase 1.5 Success (Viewport Foundation)
- Shared component library works across viewports
- Archive View fully functional
- Viewport switcher in place
- Other viewports show "coming soon" with clear vision

### Phase 2 Success (Research View)
- Document viewer with annotations
- Character reactions on-demand
- "Ask a character" functionality
- Cross-linking to Archive View

### Phase 3 Success (Live View)
- Real-time message streaming
- Channel organization
- User participation (influence conversation)
- Tension-driven event scheduling

### Phase 4 Success (Audio View)
- Generated audio for threads
- Voice consistency per character
- Transcript synchronization
- Episode/podcast organization

### Full Vision Success
- User can switch viewports fluidly
- Same world, different experiences
- Characters feel alive across all views
- Documents become genuinely explorable worlds

---

## The New Aesthetic

While Archive keeps the recovered-data CRT look, the overall system aesthetic is:

**"Research Station"**

You're at a research station that has recovered data from another dimension. Different terminals (viewports) let you examine the data differently:

- **Archive Terminal**: Text-based email recovery
- **Research Terminal**: Document analysis workstation
- **Live Terminal**: Real-time communication intercept
- **Audio Terminal**: Signal playback system

This frames the multi-viewport experience as exploring the same data through different lenses, not switching between unrelated apps.

---

## Technical Principles

### 1. Viewport Adapter Pattern

Each viewport implements a standard interface:

```typescript
interface ViewportAdapter {
  // Transform world events to viewport-specific format
  renderEvent(event: WorldEvent): ViewportContent;

  // Handle user interactions
  handleInteraction(interaction: UserInteraction): WorldEvent | null;

  // Subscribe to relevant events
  getEventFilter(): EventFilter;

  // Viewport-specific generation prompts
  getGenerationContext(character: Character): GenerationContext;
}
```

### 2. Event-Driven Architecture

World state changes emit events. Viewports subscribe to events they care about:

- Archive: `email_generated`, `thread_updated`
- Research: `passage_referenced`, `claim_challenged`
- Live: `message_sent`, `character_typing`, `reaction_added`
- Audio: `segment_ready`, `transcript_updated`

### 3. Progressive Enhancement

Start with static content, enhance with interactivity:

1. Server renders initial state
2. Web Components hydrate with interactivity
3. WebSocket connects for real-time updates (Live View)
4. Audio loads asynchronously

### 4. Shared Components

Build once, use everywhere:

- `<ev-character-avatar>`: Character profile picture/initials
- `<ev-message-bubble>`: Content with sender attribution
- `<ev-timestamp>`: Relative/absolute time display
- `<ev-tension-indicator>`: Visual tension level
- `<ev-document-reference>`: Link back to source

---

## Non-Goals (Still)

- Real-time token streaming (batch generation is fine)
- Collaborative multi-user worlds
- Integration with real email/Slack/Discord
- Mobile-first UI (desktop-first, mobile-acceptable)
- Full internationalization

---

## The Test (Updated)

When someone uses EmailVerse and:

1. **Finds themselves switching viewports** to understand the same event from different angles
2. **Genuinely curious** about what a character thinks about a specific passage
3. **Surprised** by a revealed secret that makes sense in retrospect
4. **Wants to keep listening** to character discussions
5. **Returns** to their original documents with new understanding

...we've succeeded.

The world should feel discovered, not generated. The viewports should feel like lenses, not modes.

---

## Migration from 1.0

The existing backend is **90% ready** for this vision:

**Already Done**:
- World state as source of truth ✓
- Character-model binding ✓
- Simulation tick engine ✓
- Multi-model orchestration ✓
- Deep character psychology ✓
- Tension-driven generation ✓

**Needs Addition**:
- Viewport adapter layer
- Event subscription system
- Real-time event streaming (WebSocket)
- Audio generation integration
- Shared component library

**No Breaking Changes Required**. This is extension, not replacement.
