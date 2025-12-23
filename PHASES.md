# EmailVerse Phases

## Phase 1: Static Generation (v0.1 Target)

### User Experience
1. User uploads 1-3 documents (PDF, TXT, MD)
2. Clicks "Generate Universe"
3. Sees progress indicator (1-5 minutes)
4. Receives complete email inbox to explore
5. Reads emails, threads, discovers narrative
6. No interaction beyond reading

### Technical Requirements

**Document Processing**
- [ ] Accept PDF, TXT, MD file uploads
- [ ] Extract text from PDFs (pdf-parse or similar)
- [ ] Chunk documents semantically (4000 token target)
- [ ] Extract entities using Gemini Flash
- [ ] Merge and deduplicate entities
- [ ] Identify themes
- [ ] Infer relationships (Claude)
- [ ] Store processed documents

**Character Generation**
- [ ] Generate 8-12 characters total
- [ ] 50-70% intrinsic (from documents)
- [ ] 30-50% extrinsic (archetypes)
- [ ] Deep psychology for each (goals, secrets, beliefs)
- [ ] Voice profile for each
- [ ] Voice samples (3 per character)
- [ ] Model binding
- [ ] Knowledge bounds defined

**World Simulation**
- [ ] Initialize WorldState
- [ ] Create initial tensions (3-5)
- [ ] Simulate 10-20 ticks
- [ ] Adaptive tick duration
- [ ] Event generation per tick
- [ ] World state updates
- [ ] Track what characters learn

**Email Generation**
- [ ] Generate 50-75 emails total
- [ ] Thread emails (60% of content)
- [ ] Standalone emails (20%)
- [ ] Newsletters (10%)
- [ ] Spam (10%)
- [ ] Proper threading (in-reply-to)
- [ ] Realistic timestamps
- [ ] Coherence review pass

**UI**
- [ ] Email client layout (3-panel)
- [ ] Folder list (Inbox, Threads, Newsletters, Spam)
- [ ] Email list (sender, subject, preview, date)
- [ ] Email view (full content, thread context)
- [ ] Thread collapse/expand
- [ ] Unread/read state
- [ ] Star/flag
- [ ] Recovered Archive aesthetic
- [ ] Corruption effects on some emails
- [ ] Generation progress indicator

**Infrastructure**
- [ ] Task queue (local in-memory)
- [ ] Storage (SQLite)
- [ ] Model router with all 5 providers
- [ ] API routes (Hono)
- [ ] Static file serving

### Success Criteria
- Complete generation in under 5 minutes
- Emails feel like they tell a coherent story
- Characters are distinguishable by voice
- Document themes are woven throughout
- User wants to keep reading

---

## Phase 2: User Replies

### User Experience
1. User reads an email
2. Clicks "Reply"
3. Types a response
4. Clicks "Send"
5. Response appears in thread
6. Character's reply appears (seconds later)
7. Thread continues

### Technical Requirements

**Reply Handling**
- [ ] Reply compose modal
- [ ] User message creation
- [ ] Route to correct character
- [ ] Generate character response
- [ ] Use character's bound model
- [ ] Include thread context
- [ ] Update world state (character now knows user exists)
- [ ] Append to thread

**New Character: The User**
- [ ] User is a character in the world
- [ ] User has relationships with others
- [ ] User's knowledge is tracked
- [ ] Characters respond to user appropriately

**UI Additions**
- [ ] Reply button
- [ ] Compose modal
- [ ] Sending indicator
- [ ] Response notification

### Success Criteria
- Replies feel like natural continuations
- Character voice stays consistent
- Response in under 10 seconds
- Multiple back-and-forth exchanges work

---

## Phase 3: Generate More

### User Experience
1. User is reading a thread
2. Wants to see what happens next
3. Clicks "Continue Thread"
4. New messages appear in thread
5. Tension advances

### Technical Requirements

**Thread Extension**
- [ ] "Continue Thread" button
- [ ] Determine which characters would reply next
- [ ] Plan 2-4 new messages
- [ ] Generate in character voices
- [ ] Update world state
- [ ] Possibly resolve or escalate tension
- [ ] Append to thread

**Extension Planning**
- [ ] Analyze thread state
- [ ] Check active tensions
- [ ] Determine natural next steps
- [ ] Avoid repetition
- [ ] Include surprises occasionally

**UI Additions**
- [ ] "Continue Thread" button
- [ ] Generation indicator
- [ ] New message notification

### Success Criteria
- Extended threads feel natural
- Story advances meaningfully
- Characters stay consistent
- No infinite loops

---

## Phase 4: Add Documents

### User Experience
1. User wants to expand the universe
2. Uploads additional documents
3. Processing indicator (1-2 minutes)
4. New emails appear in inbox
5. Possibly new characters
6. Existing tensions might shift

### Technical Requirements

**Incremental Processing**
- [ ] Accept new document uploads
- [ ] Process (chunk, extract, merge)
- [ ] Integrate with existing entities
- [ ] Identify new entities
- [ ] Update relationships
- [ ] Generate new characters if needed
- [ ] Create new tensions
- [ ] Simulate additional ticks
- [ ] Generate new emails

**World State Expansion**
- [ ] Merge new entities with existing
- [ ] Update character knowledge
- [ ] New characters know new document content
- [ ] Existing characters may learn new info
- [ ] New tensions can involve old characters

**UI Additions**
- [ ] "Add Documents" button
- [ ] Upload modal
- [ ] Processing indicator
- [ ] "New" badge on new emails

### Success Criteria
- New content integrates seamlessly
- Existing characters respond to new info
- World feels expanded, not just added to
- Processing under 2 minutes for small additions

---

## Future Phases (Not v0.1)

### Phase 5: Character Deep Dive
- Character profiles viewable
- Relationship visualization
- Tension map
- Knowledge graph explorer

### Phase 6: Time Control
- Rewind to earlier states
- Branch timelines
- "What if" scenarios
- Undo/redo

### Phase 7: Export & Share
- Export mailbox as HTML/PDF
- Share universe with others
- Collaborative viewing
- Social features

### Phase 8: Real-Time
- Streaming generation
- Emails arrive over time
- Notifications
- Ambient mode

---

## Priority Order

1. **Phase 1 is everything for v0.1**
2. Phase 2 is the natural next step
3. Phase 3 extends engagement
4. Phase 4 expands possibility

Don't work on later phases until earlier ones are solid.
