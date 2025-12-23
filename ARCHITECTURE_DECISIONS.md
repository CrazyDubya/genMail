# Architecture Decisions

These decisions were made through extensive exploration. They are the result of trying multiple paths, hitting dead ends, and synthesizing learnings. Trust them unless you have strong evidence they're wrong.

---

## Decision 1: World State as Organizing Principle

**Decision**: Build and maintain a WorldState object that represents the simulated world. Emails are generated FROM this state, not as the primary artifact.

**Alternatives Considered**:
- Direct email generation from documents
- Email-first with character metadata attached

**Why This Wins**:
- Characters can only know what the world state says they know
- Tensions can develop across multiple emails coherently
- Phase 2-4 (replies, extensions) have a state to modify
- Prevents contradictions between emails
- Scales better—world state is a compression of documents

**Implication**: Always update WorldState before generating dependent emails.

---

## Decision 2: Character-to-Model Binding

**Decision**: Each character is permanently bound to one LLM. That model writes ALL of that character's content.

**Alternatives Considered**:
- Any model writes any character with detailed prompts
- Model assignment per email based on type
- Single model for all characters

**Why This Wins**:
- Prevents voice drift (GPT-written Alice sounds different from Gemini-written Alice)
- Each model's quirks become character quirks
- Simpler prompting (model learns the voice, not re-explained each time)
- Allows strategic model assignment (complex characters → Claude, spam → cheap)

**Implication**: ModelRouter maintains bindings. generateAsCharacter() is the only generation interface.

---

## Decision 3: Simulation Ticks for Generation

**Decision**: Generate emails by simulating time passing. Each tick: plan events → generate artifacts → update state.

**Alternatives Considered**:
- Direct "generate N emails about X"
- One-shot generation of entire mailbox
- Real-time continuous simulation

**Why This Wins**:
- Emails have natural temporal relationships
- Threads develop across ticks
- Tensions can escalate or resolve
- Adaptive ticks (fast when exciting, skip when quiet)
- User replies (Phase 2) become events in next tick

**Implication**: Build the tick engine before email generation. Emails are a side effect.

---

## Decision 4: Hierarchical Agent Teams

**Decision**: Director agent (Claude) orchestrates specialist teams (Research, Character, Content) who have their own leads and workers.

**Alternatives Considered**:
- Flat pool of agents
- Single monolithic agent
- Peer-to-peer agent coordination

**Why This Wins**:
- Scales with document volume (teams can spawn sub-teams)
- Matches natural work decomposition
- Clear responsibility boundaries
- Can use different models for different team roles
- Director provides coherence without bottleneck

**Implication**: Director makes strategic decisions. Teams execute. Workers handle volume.

---

## Decision 5: Task Queue Abstraction

**Decision**: All work flows through a task queue. Local uses in-memory. Cloudflare uses CF Queues.

**Alternatives Considered**:
- Direct async function calls
- Event emitter pattern
- Worker threads

**Why This Wins**:
- Handles unknown workload gracefully
- Same code local and production
- Built-in retry logic
- Dependencies between tasks handled cleanly
- Scales horizontally on Cloudflare

**Implication**: Even simple operations go through the queue. Don't bypass it.

---

## Decision 6: Deep Characters

**Decision**: Characters have goals, secrets, beliefs, emotional state, and relationship patterns—not just name and writing style.

**Alternatives Considered**:
- Shallow profiles (name, role, tone)
- Medium profiles (above plus background)
- Procedural generation each time

**Why This Wins**:
- Secrets create narrative tension
- Goals drive email motivations
- Beliefs create conflict between characters
- Emotional state affects tone
- Phases 2-4 need state to modify

**Implication**: Character generation is a significant phase. Don't rush it.

---

## Decision 7: Web Components for UI

**Decision**: Build UI with vanilla Web Components, not React/Vue/etc.

**Alternatives Considered**:
- React SPA
- Static HTML + minimal JS
- Svelte

**Why This Wins**:
- No build step required
- Works in Workers environment
- Progressive enhancement friendly
- Component encapsulation
- Portable to any hosting

**Implication**: Learn Web Components patterns. Use shadow DOM appropriately.

---

## Decision 8: Recovered Archive Aesthetic

**Decision**: The UI presents as a recovered/corrupted data archive with terminal aesthetics.

**Alternatives Considered**:
- Clean modern email client
- Retro paper mail aesthetic
- Minimal unstyled

**Why This Wins**:
- Explains imperfections (corrupted = generation artifacts)
- Creates narrative framing
- Distinctive and memorable
- Aligns with user's cyberpunk interests
- More engaging than clinical

**Implication**: Build the aesthetic in from the start. It's not decoration.

---

## Decision 9: Local SQLite → Cloudflare D1

**Decision**: Develop with SQLite locally, deploy to D1. Use storage abstraction.

**Alternatives Considered**:
- D1 from the start (requires wrangler for everything)
- Separate databases (postgres local, D1 prod)
- No database (in-memory only)

**Why This Wins**:
- SQLite and D1 share syntax
- Fast local development
- Production-proven path
- Abstraction allows future changes

**Implication**: Write SQL that works in both. Test D1 compatibility early.

---

## Decision 10: Multi-Model Orchestration

**Decision**: Use 5+ models strategically: Claude (orchestration, psychology), Gemini (extraction), GPT (voices), Grok (creative), OpenRouter (volume).

**Alternatives Considered**:
- Single model (Claude for everything)
- Two-tier (Claude + cheap)
- Random assignment

**Why This Wins**:
- Cost optimization (use cheap where possible)
- Capability matching (right tool for job)
- Voice diversity (different models = different feels)
- Hedge against API issues

**Implication**: ModelRouter is critical infrastructure. Build it well.

---

## Decision 11: Phases 2-4 Designed In, Not Bolted On

**Decision**: The architecture supports Phases 2-4 from day one, even though v0.1 is Phase 1 only.

**Alternatives Considered**:
- Build Phase 1, redesign for Phase 2
- Full Phase 1-4 in v0.1
- Phase 1 only, no future consideration

**Why This Wins**:
- WorldState already supports updates
- Character binding enables consistent replies
- Simulation ticks handle time progression
- Avoids rewrites

**Implication**: When making Phase 1 decisions, ask "does this work for Phase 2?"

---

## Decision 12: Intrinsic + Extrinsic Characters

**Decision**: Some characters come from documents (intrinsic), others are generated to fill ecosystem roles (extrinsic: skeptics, spammers, newsletter curators).

**Alternatives Considered**:
- Only document characters
- Only generated characters
- User-specified character list

**Why This Wins**:
- Documents alone may not have enough voices
- Extrinsic characters create texture (spam, newsletters)
- Skeptic character challenges document claims
- More realistic email ecosystem

**Implication**: Character generation has two modes. Extrinsic needs archetypes.

---

## Open Questions (For You to Decide)

1. **Exact cheap model on OpenRouter**: Which specific model? Llama? Mistral? Based on current pricing/quality.

2. **Chunking strategy details**: Semantic chunking sounds good, but exact implementation (sentence transformers? Claude-based? Token counting heuristics?).

3. **Thread length distribution**: Should be varied, but what's the target distribution? 40% 2-3 messages, 40% 4-6, 20% 7+?

4. **Newsletter generation**: Template-based or fully generative?

5. **Error handling granularity**: Retry at task level? Regenerate entire emails? Expose errors to user?

These are implementation details. Decide as you build.
