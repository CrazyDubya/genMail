# CLAUDE.md - EmailVerse Build Guide

## Project Identity

You're building **EmailVerse**: an agentic system that transforms documents into explorable email universes. This is a multi-model orchestration project using Claude SDK, OpenAI, Gemini, Grok, and OpenRouter.

## Critical Context

This project emerged from extensive architectural exploration. Key decisions have already been made. Don't relitigate them—build on them. See `ARCHITECTURE_DECISIONS.md` for the reasoning.

## Your Approach

### Explore, Branch, Back Up, Retrace

This isn't a linear build. You should:
1. Try an implementation path
2. Branch when you see alternatives
3. Back up when you hit dead ends
4. Retrace with new knowledge
5. Ask the user when genuinely stuck

Dead ends are information. Don't fear them.

### Scale Thinking

Every component you build should work for:
- 1 document or 100
- 3 characters or 30
- 10 emails or 500
- Local dev or Cloudflare edge

If you're hardcoding limits, stop and redesign.

### Model Orchestration Principles

1. **Claude (Sonnet/Opus)**: Strategic decisions, character psychology, coherence review, orchestration
2. **Gemini Flash**: High-volume extraction, technical analysis, structured data
3. **GPT-4o-mini**: General character voices, dialogue, reliable mid-tier work
4. **Grok 3 Fast**: Creative/chaotic characters, unexpected takes, humor
5. **OpenRouter cheap/free models**: Spam, automated content, high-volume low-stakes (includes free tier like `meta-llama/llama-4-maverick:free`)

Characters are BOUND to models. Once a character is assigned to GPT, GPT writes ALL their emails. This prevents voice drift.

### Code Style

- TypeScript throughout
- Explicit types, no `any`
- Async/await, not callbacks
- Small functions with single responsibilities
- Errors as values where sensible (Result types)
- Comments explain WHY, not WHAT

### File Structure

```
genMail/
├── src/
│   ├── models/        # Multi-model router + embeddings
│   ├── pipeline/      # Document processing, character gen, RAG
│   ├── simulation/    # World state, tick engine
│   ├── storage/       # SQLite storage
│   ├── utils/         # Summarization, vector math
│   ├── api/           # Hono REST API
│   └── types.ts       # Core type definitions
├── sample/            # Sample documents for testing
└── docs/              # Additional documentation
```

Flat structure for simplicity. Cloudflare deployment will be added later.

## Build Order

### Foundation (Done)
1. ~~`src/types.ts` - Types for WorldState, Character, Email~~
2. ~~`src/models/router.ts` - Model router with all 5 providers~~
3. ~~`src/storage/sqlite.ts` - SQLite storage~~

### Pipeline (Done)
4. ~~Document ingestion + chunking (Gemini Flash for extraction)~~
5. ~~Entity merging + relationship inference (Claude)~~
6. ~~Character generation with deep psychology (Claude)~~
7. ~~Voice binding + sample generation (assigned models)~~
8. ~~Simulation tick logic~~
9. ~~Email generation (character-bound models)~~
10. ~~RAG pipeline with embeddings~~
11. ~~Thread summarization~~

### API (Done)
12. ~~REST API routes (Hono)~~

### Interface (Not Started)
13. Web Components for email client
14. Generation status/progress UI

### Phases 2-4 (Not Started)
15. Reply routing
16. Thread extension
17. Document addition

## Key Technical Decisions

### Task Queue Pattern
```typescript
interface Task<T = unknown> {
  id: string;
  type: TaskType;
  payload: T;
  dependencies: string[];
  status: 'pending' | 'running' | 'complete' | 'failed';
}

// Local: in-memory with Promise-based resolution
// Cloudflare: Queues with Worker consumers
```

### Model Router Pattern
```typescript
class ModelRouter {
  private characterBindings: Map<CharacterId, ModelId>;
  
  async generateAsCharacter(
    characterId: string,
    prompt: string,
    context: GenerationContext
  ): Promise<string>;
}
```

### Storage Abstraction
```typescript
interface Storage {
  documents: DocumentStore;
  world: WorldStateStore;
  emails: EmailStore;
}

// Implementations: LocalStorage (SQLite), CloudflareStorage (D1/R2/KV)
```

### World State as Source of Truth
```typescript
interface WorldState {
  characters: Map<CharacterId, Character>;
  relationships: RelationshipGraph;
  tensions: Tension[];
  knowledge: KnowledgeGraph;
  timeline: Event[];
  emails: Email[];
}
```

## Environment Variables

```env
# Required
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_AI_API_KEY=
XAI_API_KEY=
OPENROUTER_API_KEY=

# Optional
LOG_LEVEL=debug
MAX_CONCURRENT_TASKS=10
DEFAULT_EMAIL_COUNT=50
```

## Testing Strategy

- Unit tests for pure functions (chunking, merging, formatting)
- Integration tests for model router (mock responses)
- End-to-end tests for full generation pipeline (small document set)
- Snapshot tests for UI components

## When You're Stuck

1. Re-read `NORTH_STAR.md` for vision alignment
2. Check `ARCHITECTURE_DECISIONS.md` for prior reasoning
3. Look at `src/types.ts` for data shape guidance
4. Check `docs/issues/` for historical fixes and troubleshooting
5. Ask the user with specific options, not open questions

## Red Flags to Avoid

- ❌ Building a "simple version first" that doesn't scale
- ❌ Skipping the character binding system
- ❌ Generating emails directly without world simulation
- ❌ Tight coupling between local and Cloudflare implementations
- ❌ Ignoring the task queue for "simpler" direct calls
- ❌ Making characters shallow (no goals, secrets, emotional state)

## Green Lights

- ✅ Building proper abstractions even if they take longer
- ✅ Using the task queue from the start
- ✅ Deep character generation before any email generation
- ✅ Simulation ticks as the email generation mechanism
- ✅ Web Components for progressive enhancement
- ✅ Testing model integrations early

## Definition of Done (v0.1)

**Backend (Complete)**
- [x] Upload 1-3 documents (PDF, TXT, MD)
- [x] Generate 50-75 emails in under 5 minutes
- [x] 8-12 characters with distinct voices
- [x] Coherent threads (3-7 messages each)
- [x] Runs locally with SQLite
- [x] All model integrations functional
- [x] No hardcoded limits that break at scale

**Frontend (Remaining)**
- [ ] Working email client UI with folders
- [ ] Generation status/progress UI
