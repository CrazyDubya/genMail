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
3. **GPT-5.2 nano**: General character voices, dialogue, reliable mid-tier work
4. **Grok 3 Fast**: Creative/chaotic characters, unexpected takes, humor
5. **OpenRouter cheap models**: Spam, automated content, high-volume low-stakes

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
emailverse/
├── packages/           # Shared libraries
│   ├── core/          # Types, utilities
│   ├── agents/        # Agent implementations
│   ├── simulation/    # World state, ticks
│   ├── queue/         # Task queue abstraction
│   ├── storage/       # Storage abstraction
│   └── ui/            # Web Components
├── apps/
│   ├── local/         # Local dev server (Hono)
│   └── cloudflare/    # Workers deployment
└── docs/              # Documentation
```

Use pnpm workspaces. Keep packages focused.

## Build Order

### Foundation First
1. `packages/core` - Types for WorldState, Character, Email, Task
2. `packages/agents/models` - Model router with all 5 providers
3. `packages/queue` - Task queue (local implementation first)
4. `packages/storage` - Storage (SQLite first)

### Then the Pipeline
5. Document ingestion + chunking (Gemini Flash for extraction)
6. Entity merging + relationship inference (Claude)
7. Character generation with deep psychology (Claude)
8. Voice binding + sample generation (assigned models)
9. Simulation tick logic
10. Email generation (character-bound models)

### Then the Interface
11. Web Components for email client
12. API routes (Hono locally)
13. Generation status/progress UI
14. Integration testing

### Then Phases 2-4
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
3. Look at `TYPES.ts` for data shape guidance
4. Ask the user with specific options, not open questions

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

- [ ] Upload 1-3 documents (PDF, TXT, MD)
- [ ] Generate 50-75 emails in under 5 minutes
- [ ] 8-12 characters with distinct voices
- [ ] Coherent threads (3-7 messages each)
- [ ] Working email client UI with folders
- [ ] Runs locally with SQLite
- [ ] All model integrations functional
- [ ] No hardcoded limits that break at scale
