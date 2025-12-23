# EmailVerse: North Star

## The Vision

**EmailVerse transforms documents into living narrative worlds, observable through the intimate lens of an email inbox.**

Users upload documents. Minutes later, they're reading the recovered communications of characters who inhabited those documents—debates, secrets, newsletters, spam, personal notes. The documents become a world. The emails become windows into that world.

## Core Philosophy

### 1. World First, Emails Second

We don't "generate emails." We simulate a world where characters exist, have relationships, pursue goals, harbor secrets, and experience tensions. Emails are artifacts produced BY that world—the observable output of simulated lives.

This matters because:
- Emails reference events that actually happened in the simulation
- Characters only know what they would know
- Threads develop naturally across simulated time
- Adding documents expands the world, not just the email count

### 2. Narrative Coherence Over Volume

A mailbox with 30 emails that tell a coherent story is infinitely more valuable than 200 disconnected messages. Every email should:
- Advance or reveal something about a tension
- Express authentic character voice
- Connect to the document source material
- Invite the reader deeper into the world

### 3. Deep Characters, Bound Voices

Characters aren't templates—they're psychological entities with:
- Goals they pursue
- Secrets they protect
- Beliefs that cause friction
- Emotional patterns that shape their communication
- Relationships that constrain their behavior

Each character's voice is bound to ONE model. That model writes ALL their emails. This prevents voice drift and creates genuine consistency.

### 4. Scale-Ready by Design

We don't know:
- How many documents users will upload
- How large those documents will be
- How many characters will emerge
- How many emails the world needs

Therefore, the architecture must handle unknown scale gracefully. No hardcoded limits. Hierarchical agent teams that can spawn sub-teams. Task queues that work locally and at edge.

### 5. Local-First, Cloud-Ready

Development happens locally with SQLite and in-memory queues. Production deploys to Cloudflare with D1, R2, KV, and Queues. The abstraction layer means the code doesn't care where it runs.

## The Experience

### What Users See

1. **Upload**: Drag documents into the interface
2. **Wait**: 1-5 minutes of generation (with progress indicators)
3. **Explore**: A complete email client with folders, threads, messages
4. **Discover**: Reading emails reveals the world—tensions, secrets, relationships
5. **Interact** (Phase 2+): Reply to emails, generate more, add documents

### The Aesthetic: Recovered Archive

The UI tells a story: you've recovered a data archive. Some emails are pristine. Some are corrupted. Some have redactions. The visual style is:
- CRT/terminal aesthetic with subtle scanlines
- Monospace typography
- Accent color: terminal green (#00ff88)
- Glitch effects on "corrupted" content
- Professional email client layout underneath the aesthetic

## What Success Looks Like

### Phase 1 Success
- Upload 2-3 documents
- Wait 2-4 minutes
- Receive 50-75 emails across multiple characters
- Emails form coherent threads with natural development
- Characters feel distinct and consistent
- Document themes are woven throughout
- User wants to keep reading

### Phase 2-4 Success
- Replies feel like natural conversation continuations
- "Generate more" produces coherent thread extensions
- Added documents expand the world organically
- The mailbox feels like it could keep growing forever

## Non-Goals (For Now)

- Real-time generation (streaming individual tokens)
- Collaborative/multi-user mailboxes
- Integration with real email systems
- Mobile-first UI
- Internationalization

These may come later. Not v0.1.

## The Test

When someone uses EmailVerse and finds themselves genuinely curious about what happened between two characters, genuinely surprised by a revealed secret, genuinely entertained by the spam that emerged from their documents—we've succeeded.

The emails should feel discovered, not generated.
