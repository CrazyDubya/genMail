/**
 * Simulation Tick Engine
 *
 * Runs the simulation, generating events and emails each tick.
 */

import { v4 as uuid } from 'uuid';
import type {
  WorldState,
  Character,
  Tension,
  EventType,
  Email,
  Thread,
  TickResult,
  WorldStateChange,
  TensionId,
  EventId,
  CharacterId,
  EmailId,
  ThreadId,
  Theme,
  DocumentContext,
  ProcessedDocument,
} from '../types.js';
import type { ModelRouter } from '../models/router.js';

// =============================================================================
// TICK CONFIGURATION
// =============================================================================

interface TickOptions {
  targetEventsPerTick?: number;
  tickDurationHours?: number;
}

// =============================================================================
// MULTI-DOCUMENT CONTEXT MERGING
// =============================================================================

/**
 * Merge context from all documents in the universe.
 *
 * Previously we only used documents[0]?.context, ignoring all other documents.
 * This function combines thesis, concepts, claims, and summaries from ALL docs.
 */
function getMergedDocumentContext(documents: ProcessedDocument[]): DocumentContext | undefined {
  if (documents.length === 0) return undefined;
  if (documents.length === 1) return documents[0].context;

  // Merge thesis from all docs
  const theses = documents.map(d => d.context?.thesis).filter(Boolean) as string[];
  const mergedThesis = theses.length === 1
    ? theses[0]
    : theses.join(' Additionally, ');

  // Combine core concepts from all docs (deduplicated)
  const allConcepts = documents.flatMap(d => d.context?.coreConcepts ?? []);
  const uniqueConcepts = [...new Set(allConcepts)];

  // Combine claims from all docs
  const allClaims = documents.flatMap(d => d.context?.claims ?? []);

  // Combine argument structures from all docs
  const allArguments = documents.flatMap(d => d.context?.argumentStructure ?? []);

  // Combine summaries
  const allSummaries = documents.map(d => d.context?.summary ?? '').filter(s => s.length > 0);
  const mergedSummary = allSummaries.join('\n\n--- From another document ---\n\n');

  // Combine significance
  const allSignificance = documents.map(d => d.context?.significance ?? '').filter(s => s.length > 0);
  const mergedSignificance = allSignificance.join(' Furthermore, ');

  // Use first document as base for structure fields
  const baseContext = documents[0].context;
  if (!baseContext) return undefined;

  return {
    ...baseContext,
    thesis: mergedThesis,
    coreConcepts: uniqueConcepts,
    claims: allClaims,
    argumentStructure: allArguments,
    summary: mergedSummary,
    significance: mergedSignificance,
  };
}

/**
 * Get all rich concepts from all documents.
 */
function getAllDocumentConcepts(documents: ProcessedDocument[]) {
  return documents.flatMap(d => d.concepts ?? []);
}

// =============================================================================
// THREAD ANALYSIS (Semantic understanding of conversations)
// =============================================================================

interface ThreadAnalysis {
  topicsCovered: string[];
  participantPositions: Array<{ name: string; position: string }>;
  openQuestions: string[];
  suggestedDirection: string;
  emotionalTone: string;
}

// Thread analysis cache - keyed by thread ID, stores analysis result
// This prevents redundant LLM calls when generating multiple emails in the same thread
const threadAnalysisCache = new Map<
  ThreadId,
  { analysis: ThreadAnalysis; emailCount: number }
>();

/**
 * Get cached thread analysis or generate new one.
 * Cache is invalidated when the thread has new emails since last analysis.
 */
async function getCachedThreadAnalysis(
  threadId: ThreadId,
  threadEmails: Email[],
  sender: Character,
  world: WorldState,
  router: ModelRouter
): Promise<ThreadAnalysis | null> {
  const cached = threadAnalysisCache.get(threadId);

  // Use cache if email count hasn't changed (no new emails in thread)
  if (cached && cached.emailCount === threadEmails.length) {
    return cached.analysis;
  }

  // Generate fresh analysis
  const analysis = await analyzeThread(threadEmails, sender, world, router);

  // Cache the result if successful
  if (analysis) {
    threadAnalysisCache.set(threadId, {
      analysis,
      emailCount: threadEmails.length,
    });
  }

  return analysis;
}

/**
 * Clear the thread analysis cache (call between ticks or when starting fresh)
 */
export function clearThreadAnalysisCache(): void {
  threadAnalysisCache.clear();
}

// =============================================================================
// EVENT PLANNING
// =============================================================================

interface PlannedEvent {
  type: EventType;
  description: string;
  participants: CharacterId[];
  affectedTensions: TensionId[];
  shouldGenerateEmail: boolean;
  existingThreadId?: ThreadId;  // If set, join this thread instead of creating new one
}

/**
 * Plan events for a tick based on world state.
 */
async function planTickEvents(
  world: WorldState,
  _router: ModelRouter,
  options: TickOptions
): Promise<PlannedEvent[]> {
  const targetEvents = options.targetEventsPerTick ?? 3;
  const events: PlannedEvent[] = [];

  // Get active tensions
  const activeTensions = world.tensions.filter(
    (t) => t.status === 'building' || t.status === 'active'
  );

  // Get available characters
  const characters = world.characters.filter((c) => c.archetype !== 'spammer');

  // Build a map of tensions that already have active threads
  // This prevents spawning multiple parallel conversations about the same tension
  const tensionToExistingThread = new Map<TensionId, ThreadId>();
  const tensionsWithActiveConversations = new Set<TensionId>();

  for (const email of world.emails) {
    // Find which tension this email's thread relates to
    for (const tension of activeTensions) {
      // Check if email subject matches tension description
      const tensionKeywords = tension.description.toLowerCase().split(' ').filter((w) => w.length > 4);
      const subjectLower = email.subject.toLowerCase();
      const matchScore = tensionKeywords.filter((kw) => subjectLower.includes(kw)).length;

      if (matchScore >= 2) {
        // This thread is about this tension
        if (!tensionToExistingThread.has(tension.id)) {
          tensionToExistingThread.set(tension.id, email.threadId);
        }
        tensionsWithActiveConversations.add(tension.id);
        break;
      }
    }
  }

  // Plan tension-driven events - but only for tensions WITHOUT active conversations
  // This prevents "the same topic, different participants" problem
  const tensionsNeedingNewConversation = activeTensions.filter(
    (t) => !tensionsWithActiveConversations.has(t.id)
  );

  for (const tension of tensionsNeedingNewConversation.slice(0, 1)) {
    const participants = tension.participants
      .map((id) => world.characters.find((c) => c.id === id))
      .filter((c): c is Character => c !== undefined);

    if (participants.length >= 1) {
      events.push({
        type: 'communication',
        description: `Discussion about: ${tension.description}`,
        participants: participants.map((p) => p.id),
        affectedTensions: [tension.id],
        shouldGenerateEmail: true,
      });
    }
  }

  // For tensions WITH active conversations, encourage replies instead of new threads
  // Select a character who should respond (someone who was addressed but hasn't replied)
  for (const tension of activeTensions.filter((t) => tensionsWithActiveConversations.has(t.id)).slice(0, 1)) {
    const existingThreadId = tensionToExistingThread.get(tension.id);
    if (!existingThreadId) continue;

    const threadEmails = world.emails.filter((e) => e.threadId === existingThreadId);
    if (threadEmails.length === 0) continue;

    const lastEmail = threadEmails[threadEmails.length - 1];
    // Find a recipient who hasn't replied yet
    const waitingToReply = lastEmail.to.find((recipient) => {
      const recipientEmails = threadEmails.filter((e) => e.from.characterId === recipient.characterId);
      const lastRecipientEmail = recipientEmails[recipientEmails.length - 1];
      // Check if recipient's last email is older than the last email in thread
      return !lastRecipientEmail || lastRecipientEmail.sentAt < lastEmail.sentAt;
    });

    if (waitingToReply) {
      const respondingCharacter = world.characters.find((c) => c.id === waitingToReply.characterId);
      if (respondingCharacter) {
        events.push({
          type: 'communication',
          description: `Responding to thread about: ${tension.description}`,
          participants: [respondingCharacter.id, lastEmail.from.characterId],
          affectedTensions: [tension.id],
          shouldGenerateEmail: true,
          existingThreadId: existingThreadId as ThreadId,  // Join existing thread
        });
      }
    }
  }

  // Plan character-driven events with goal progression awareness
  const activeCharacters = characters.filter(
    (c) => c.emailBehavior.frequency === 'prolific' ||
           (c.emailBehavior.frequency === 'moderate' && Math.random() > 0.5)
  );

  for (const character of activeCharacters.slice(0, targetEvents - events.length)) {
    // Skip characters who are waiting for responses in their threads
    // This prevents one character from dominating the conversation
    const characterThreads = world.emails
      .filter((e) => e.from.characterId === character.id)
      .map((e) => e.threadId);

    const uniqueThreads = [...new Set(characterThreads)];
    const waitingForResponse = uniqueThreads.some((threadId) => {
      const threadEmails = world.emails.filter((e) => e.threadId === threadId);
      const lastEmail = threadEmails[threadEmails.length - 1];
      return lastEmail?.from.characterId === character.id;
    });

    // 70% chance to skip characters waiting for response - gives others a turn
    if (waitingForResponse && Math.random() > 0.3) {
      continue;
    }
    // Check if character has urgent goals
    const urgentGoal = character.goals.find((g) => g.priority === 'immediate');

    if (urgentGoal) {
      const goalStage = urgentGoal.stage ?? 'initial';
      const emailsSent = urgentGoal.emailsSent?.length ?? 0;

      // Skip if goal is advanced and character has sent many emails - they should wait for responses
      if (goalStage === 'advanced' && emailsSent >= 4) {
        // Maybe downgrade goal priority or skip
        continue;
      }

      // Vary the event description based on goal stage to encourage different approaches
      let eventDescription: string;
      if (goalStage === 'initial' || emailsSent === 0) {
        eventDescription = `Working on: ${urgentGoal.description}`;
      } else if (goalStage === 'in_progress') {
        const progressDescriptions = [
          `Following up on: ${urgentGoal.description}`,
          `Advancing discussion on: ${urgentGoal.description}`,
          `Building on previous points about: ${urgentGoal.description}`,
        ];
        eventDescription = progressDescriptions[emailsSent % progressDescriptions.length];
      } else {
        const advancedDescriptions = [
          `Wrapping up thoughts on: ${urgentGoal.description}`,
          `Responding to feedback about: ${urgentGoal.description}`,
          `Addressing questions about: ${urgentGoal.description}`,
        ];
        eventDescription = advancedDescriptions[emailsSent % advancedDescriptions.length];
      }

      events.push({
        type: 'communication',
        description: eventDescription,
        participants: [character.id],
        affectedTensions: urgentGoal.relatedTensions ?? [],
        shouldGenerateEmail: true,
      });
    }
  }

  // Add newsletter if we have a curator - but limit frequency
  const curator = world.characters.find((c) => c.archetype === 'newsletter_curator');
  if (curator) {
    // Check when the last newsletter was sent
    const newsletters = world.emails.filter((e) => e.type === 'newsletter');
    const lastNewsletter = newsletters.length > 0
      ? newsletters.reduce((latest, e) => e.sentAt > latest.sentAt ? e : latest)
      : null;

    // Only generate if at least 5 ticks have passed since the last newsletter
    // This prevents newsletter spam while still allowing regular updates
    const ticksSinceLastNewsletter = lastNewsletter
      ? world.tickCount - (lastNewsletter.generatedBy?.tick ?? 0)
      : 999;

    if (ticksSinceLastNewsletter >= 5) {
      events.push({
        type: 'external',
        description: 'Newsletter publication',
        participants: [curator.id],
        affectedTensions: [],
        shouldGenerateEmail: true,
      });
    }
  }

  // Add spam occasionally
  const spammer = world.characters.find((c) => c.archetype === 'spammer');
  if (spammer && Math.random() < world.config.spamRatio) {
    events.push({
      type: 'external',
      description: 'Spam campaign',
      participants: [spammer.id],
      affectedTensions: [],
      shouldGenerateEmail: true,
    });
  }

  return events;
}

// =============================================================================
// EMAIL GENERATION
// =============================================================================

/**
 * Generate emails from events.
 */
async function generateEmailsFromEvents(
  events: PlannedEvent[],
  world: WorldState,
  router: ModelRouter,
  currentTime: Date
): Promise<{ emails: Email[]; threads: Thread[] }> {
  const emails: Email[] = [];
  const threads: Thread[] = [];

  for (const event of events) {
    if (!event.shouldGenerateEmail) continue;

    const sender = world.characters.find((c) => c.id === event.participants[0]);
    if (!sender) continue;

    // Determine recipients
    const recipients = getEventRecipients(event, sender, world);
    if (recipients.length === 0 && event.type === 'communication') {
      // Need at least one recipient for communication
      const randomRecipient = world.characters.find(
        (c) => c.id !== sender.id && c.archetype !== 'spammer'
      );
      if (randomRecipient) recipients.push(randomRecipient);
    }

    // Check if this is part of an existing thread
    // First check if the event explicitly specifies a thread to join
    let existingThread: Thread | undefined;
    if (event.existingThreadId) {
      // First check if we already created this thread in this tick
      existingThread = threads.find((t) => t.id === event.existingThreadId);

      // Otherwise reconstruct from emails
      if (!existingThread) {
        const threadEmails = world.emails.filter((e) => e.threadId === event.existingThreadId);
        if (threadEmails.length > 0) {
          // Reconstruct minimal thread info
          const firstEmail = threadEmails[0];
          existingThread = {
            id: event.existingThreadId,
            subject: firstEmail.subject,
            participants: [...new Set(threadEmails.flatMap((e) => [e.from.characterId, ...e.to.map((t) => t.characterId)]))],
            emails: threadEmails.map((e) => e.id),
            startedAt: firstEmail.sentAt,
            lastActivityAt: threadEmails[threadEmails.length - 1].sentAt,
            messageCount: threadEmails.length,
            relatedTensions: event.affectedTensions,
            originType: 'communication',
            conversationState: {
              pendingQuestions: [],
              pointsByParticipant: {},
              discussedTopics: [],
            },
          };
        }
      }
    }

    // If no explicit thread, try to find one naturally
    if (!existingThread) {
      existingThread = findRelatedThread(event, world, sender, recipients);
    }

    let inReplyTo: EmailId | undefined;
    let thread: Thread;

    if (!existingThread) {
      // Create new thread with origin type tracking
      const threadId = uuid() as ThreadId;

      // Determine origin type based on sender archetype or event type
      let originType: Thread['originType'] = 'communication';
      if (sender.archetype === 'spammer') originType = 'spam';
      else if (sender.archetype === 'newsletter_curator') originType = 'newsletter';
      else if (event.type === 'external') originType = 'external';

      thread = {
        id: threadId,
        subject: generateSubject(event, sender, world),
        participants: [sender.id, ...recipients.map((r) => r.id)],
        emails: [],
        startedAt: currentTime,
        lastActivityAt: currentTime,
        messageCount: 0,
        relatedTensions: event.affectedTensions,
        originType,
        conversationState: {
          pendingQuestions: [],
          pointsByParticipant: {},
          discussedTopics: [],
        },
      };
      threads.push(thread);
    } else {
      thread = existingThread;
      // Find email to reply to
      const threadEmails = world.emails.filter((e) => e.threadId === thread.id);
      if (threadEmails.length > 0) {
        inReplyTo = threadEmails[threadEmails.length - 1].id;
      }
    }

    // Generate email content
    const email = await generateEmail(
      sender,
      recipients,
      thread,
      event,
      world,
      router,
      currentTime,
      inReplyTo
    );

    emails.push(email);
    thread.emails.push(email.id);
    thread.messageCount++;
    thread.lastActivityAt = currentTime;
  }

  return { emails, threads };
}

function getEventRecipients(
  event: PlannedEvent,
  sender: Character,
  world: WorldState
): Character[] {
  // For tension-driven events, include other participants
  if (event.affectedTensions.length > 0) {
    const tension = world.tensions.find((t) => t.id === event.affectedTensions[0]);
    if (tension) {
      return world.characters.filter(
        (c) => tension.participants.includes(c.id) && c.id !== sender.id
      );
    }
  }

  // For newsletters/spam, target multiple recipients
  if (sender.archetype === 'newsletter_curator' || sender.archetype === 'spammer') {
    return world.characters
      .filter((c) => c.id !== sender.id && c.archetype !== 'spammer')
      .slice(0, 5);
  }

  // Find related characters
  const relationships = world.relationships.filter(
    (r) => r.participants.includes(sender.id)
  );

  return relationships
    .map((r) => {
      const otherId = r.participants.find((p) => p !== sender.id);
      return world.characters.find((c) => c.id === otherId);
    })
    .filter((c): c is Character => c !== undefined)
    .slice(0, 3);
}

/**
 * Get the origin type of a thread based on its first email.
 */
function getThreadOriginType(threadEmails: Email[], world: WorldState): Thread['originType'] {
  if (threadEmails.length === 0) return 'communication';
  const firstEmail = threadEmails[0];
  const sender = world.characters.find((c) => c.id === firstEmail.from.characterId);
  if (sender?.archetype === 'spammer') return 'spam';
  if (sender?.archetype === 'newsletter_curator') return 'newsletter';
  if (firstEmail.type === 'spam') return 'spam';
  if (firstEmail.type === 'newsletter') return 'newsletter';
  if (firstEmail.type === 'automated') return 'external';
  return 'communication';
}

/**
 * Check if a thread has unbalanced participation (one person dominating).
 * Returns true if the sender should NOT add to this thread.
 * This prevents monologue threads where one person sends multiple messages
 * without any responses from others.
 */
function hasUnbalancedParticipation(
  threadEmails: Email[],
  senderId: CharacterId
): boolean {
  if (threadEmails.length < 2) return false;

  // Block if last 2 messages are from same sender (consecutive messages without response)
  const lastTwoFromSender = threadEmails.slice(-2).every(
    (e) => e.from.characterId === senderId
  );
  if (lastTwoFromSender) return true;

  // Check overall balance - if sender has 2+ more messages than responses received
  const senderCount = threadEmails.filter(
    (e) => e.from.characterId === senderId
  ).length;
  const otherCount = threadEmails.length - senderCount;

  // If sender has sent 2+ more messages than they've received responses, stop
  if (senderCount >= otherCount + 2) return true;

  return false;
}

function findRelatedThread(
  event: PlannedEvent,
  world: WorldState,
  sender: Character,
  recipients: Character[]
): Thread | undefined {
  // Only continue threads for communication events
  if (event.type !== 'communication') return undefined;

  // Find threads with overlapping participants
  const participantIds = new Set([sender.id, ...recipients.map((r) => r.id)]);

  const existingThreads = world.emails
    .filter((e) => {
      const threadEmails = world.emails.filter((te) => te.threadId === e.threadId);
      return threadEmails.length < 7; // Max 7 messages per thread
    })
    .map((e) => e.threadId);

  // Find a thread where these characters already participate
  for (const threadId of new Set(existingThreads)) {
    const threadEmails = world.emails.filter((e) => e.threadId === threadId);
    if (threadEmails.length === 0) continue;

    // NEW: Check thread origin type - communication events should only join communication threads
    const originType = getThreadOriginType(threadEmails, world);
    if (originType === 'spam' || originType === 'newsletter') {
      // Never join spam or newsletter threads with regular communication
      continue;
    }

    // Check if this thread has unbalanced participation
    // This prevents monologue threads where one person dominates
    if (hasUnbalancedParticipation(threadEmails, sender.id)) {
      // This sender needs to wait for responses before adding more
      continue;
    }

    const threadParticipants = new Set(
      threadEmails.flatMap((e) => [e.from.characterId, ...e.to.map((t) => t.characterId)])
    );

    // Check overlap
    const overlap = [...participantIds].filter((id) => threadParticipants.has(id));
    if (overlap.length >= 2 && Math.random() > 0.4) {
      return {
        id: threadId,
        subject: threadEmails[0].subject,
        participants: [...threadParticipants],
        emails: threadEmails.map((e) => e.id),
        startedAt: threadEmails[0].sentAt,
        lastActivityAt: threadEmails[threadEmails.length - 1].sentAt,
        messageCount: threadEmails.length,
        relatedTensions: [],
        originType,
      };
    }
  }

  return undefined;
}

function generateSubject(
  event: PlannedEvent,
  sender: Character,
  world: WorldState
): string {
  // For newsletters
  if (sender.archetype === 'newsletter_curator') {
    const themes = world.documents.flatMap((d) => d.themes);
    const topTheme = themes[0]?.name ?? 'Updates';
    return `Weekly ${topTheme} Digest #${world.tickCount + 1}`;
  }

  // For spam - use distinctive subjects that won't be confused with legitimate threads
  if (sender.archetype === 'spammer') {
    const spamSubjects = [
      '🚨 URGENT: You\'ve been selected!',
      'Limited Time Offer - Act Now!',
      '💰 Congratulations! You Won!',
      '⚡ Exclusive Deal Just For You',
      '🔥 Don\'t Miss This Opportunity!',
      '✨ Special Invitation Inside',
      '🎁 Your Free Gift Awaits',
    ];
    return spamSubjects[Math.floor(Math.random() * spamSubjects.length)];
  }

  // For tension-driven events
  if (event.affectedTensions.length > 0) {
    const tension = world.tensions.find((t) => t.id === event.affectedTensions[0]);
    if (tension) {
      return `Re: ${tension.description.slice(0, 50)}`;
    }
  }

  // Default subjects based on event type
  const subjects = [
    'Quick question',
    'Following up',
    'Thoughts on this?',
    'Need your input',
    'Update',
    'FYI',
  ];
  return subjects[Math.floor(Math.random() * subjects.length)];
}

/**
 * Extract the main approach/angle from an email for goal progression tracking.
 * Returns a short phrase describing what angle was taken.
 * Uses bounded operations to avoid ReDoS vulnerabilities.
 */
function extractApproachFromEmail(body: string): string | null {
  // Limit input length for safety
  const safeBody = body.slice(0, 1000);

  // Find the first substantive sentence
  const sentences = safeBody.split(/[.!?]+/).filter((s) => s.trim().length > 30);
  if (sentences.length === 0) return null;

  // Clean and truncate - use bounded slice instead of unbounded regex
  let firstSentence = sentences[0].trim().slice(0, 200);

  // Remove greetings (safe bounded removal)
  const greetings = ['hi ', 'hello ', 'hey ', 'dear '];
  const lowerSentence = firstSentence.toLowerCase();
  for (const greeting of greetings) {
    if (lowerSentence.startsWith(greeting)) {
      const commaIdx = firstSentence.indexOf(',');
      if (commaIdx !== -1 && commaIdx < 50) {
        firstSentence = firstSentence.slice(commaIdx + 1).trim();
      }
      break;
    }
  }

  // Remove common lead-ins (safe bounded removal)
  const leadIns = ['i think ', 'i believe ', 'we should ', 'let me ', 'i wanted to ', 'just wanted to '];
  const lowerClean = firstSentence.toLowerCase();
  for (const leadIn of leadIns) {
    if (lowerClean.startsWith(leadIn)) {
      firstSentence = firstSentence.slice(leadIn.length).trim();
      break;
    }
  }

  // Extract key noun phrases using indexOf (safer than unbounded regex)
  const topicIndicators = ['about ', 'regarding ', 'on ', 'consider ', 'discuss '];
  for (const indicator of topicIndicators) {
    const idx = firstSentence.toLowerCase().indexOf(indicator);
    if (idx !== -1) {
      const start = idx + indicator.length;
      let end = firstSentence.length;
      // Find next comma or period
      const nextComma = firstSentence.indexOf(',', start);
      const nextPeriod = firstSentence.indexOf('.', start);
      if (nextComma !== -1) end = Math.min(end, nextComma);
      if (nextPeriod !== -1) end = Math.min(end, nextPeriod);
      return firstSentence.slice(start, end).trim().slice(0, 60);
    }
  }

  // Fallback to first 60 chars
  return firstSentence.slice(0, 60);
}

/**
 * Extract key points from an email body for anti-repetition tracking.
 * Returns a list of main ideas/phrases from the email.
 * Uses bounded operations to avoid ReDoS vulnerabilities.
 */
function extractKeyPoints(body: string): string[] {
  const points: string[] = [];

  // Limit input length for safety
  const safeBody = body.slice(0, 2000);

  // Split into sentences and extract substantive ones
  const sentences = safeBody.split(/[.!?]+/).filter((s) => s.trim().length > 20);

  for (const sentence of sentences.slice(0, 5)) {
    // Clean up and extract the core point - use bounded string operations
    let cleaned = sentence.trim().slice(0, 150);

    // Remove greetings (safe bounded removal)
    const greetings = ['hi ', 'hello ', 'hey ', 'dear '];
    const lowerCleaned = cleaned.toLowerCase();
    for (const greeting of greetings) {
      if (lowerCleaned.startsWith(greeting)) {
        const commaIdx = cleaned.indexOf(',');
        if (commaIdx !== -1 && commaIdx < 50) {
          cleaned = cleaned.slice(commaIdx + 1).trim();
        }
        break;
      }
    }

    // Remove common lead-ins (safe bounded removal)
    const leadIns = ['i think ', 'i believe ', 'we should ', 'let me ', 'i wanted to '];
    const lowerAfter = cleaned.toLowerCase();
    for (const leadIn of leadIns) {
      if (lowerAfter.startsWith(leadIn)) {
        cleaned = cleaned.slice(leadIn.length).trim();
        break;
      }
    }

    cleaned = cleaned.slice(0, 100);

    if (cleaned.length > 15) {
      points.push(cleaned);
    }
  }

  return points;
}

/**
 * Build context about what the sender has already said in this thread.
 */
function buildSenderHistoryContext(
  senderId: CharacterId,
  threadEmails: Email[]
): { senderMessages: string[]; pointsAlreadyMade: string[] } {
  const senderEmails = threadEmails.filter((e) => e.from.characterId === senderId);

  const senderMessages = senderEmails.map((e) => e.body);
  const pointsAlreadyMade = senderEmails.flatMap((e) => extractKeyPoints(e.body));

  return { senderMessages, pointsAlreadyMade };
}

/**
 * Identify questions or points from other participants that need addressing.
 * Uses safe string processing to avoid ReDoS vulnerabilities.
 */
function findUnansweredPoints(
  senderId: CharacterId,
  threadEmails: Email[]
): string[] {
  const unanswered: string[] = [];

  // Get emails from others
  const othersEmails = threadEmails.filter((e) => e.from.characterId !== senderId);

  for (const email of othersEmails.slice(-3)) {
    // Limit body length to prevent ReDoS on very long strings
    const body = email.body.slice(0, 2000);

    // Split by sentences first, then find questions (safer than regex with unbounded repetition)
    const sentences = body.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      if (sentence.includes('?') && sentence.length > 10 && sentence.length < 200) {
        unanswered.push(sentence.trim());
        if (unanswered.length >= 4) break;
      }
    }

    // Look for direct requests using word boundaries (safer pattern)
    const requestPatterns = ['what do you think', 'your thoughts', 'your perspective', 'can you', 'could you'];
    for (const pattern of requestPatterns) {
      const idx = body.toLowerCase().indexOf(pattern);
      if (idx !== -1) {
        // Extract up to the next sentence boundary
        const start = idx;
        let end = start + 100;
        const nextPeriod = body.indexOf('.', start);
        const nextQuestion = body.indexOf('?', start);
        const nextExclaim = body.indexOf('!', start);
        const boundaries = [nextPeriod, nextQuestion, nextExclaim].filter((b) => b > start);
        if (boundaries.length > 0) {
          end = Math.min(...boundaries) + 1;
        }
        unanswered.push(body.slice(start, Math.min(end, start + 150)).trim());
        break; // Only one request per email
      }
    }
  }

  return unanswered.slice(0, 4);
}

/**
 * Analyze thread semantically using LLM to understand conversation flow.
 * This provides deep understanding of what's been discussed and what should come next.
 */
async function analyzeThread(
  threadEmails: Email[],
  sender: Character,
  world: WorldState,
  router: ModelRouter
): Promise<ThreadAnalysis | null> {
  // Only analyze if there are previous emails
  if (threadEmails.length === 0) {
    return null;
  }

  // Build conversation transcript
  const transcript = threadEmails.map((e) => {
    const senderChar = world.characters.find((c) => c.id === e.from.characterId);
    return `[${senderChar?.name ?? e.from.displayName}]: ${e.body}`;
  }).join('\n\n');

  // Get document context for grounding (merged from all documents)
  const docContext = getMergedDocumentContext(world.documents);
  const documentThesis = docContext?.thesis ?? '';
  const coreConcepts = docContext?.coreConcepts ?? [];

  const prompt = `Analyze this email thread to help a participant write a meaningful response.

DOCUMENT BEING DISCUSSED:
Thesis: ${documentThesis}
Key concepts: ${coreConcepts.join(', ')}

EMAIL THREAD:
${transcript}

NEXT SENDER: ${sender.name} (${sender.archetype})

Analyze and provide:
1. What specific topics/points have been covered (not vague summaries)
2. Each participant's position/stance on the document
3. Open questions that need responses
4. What direction would advance this conversation productively

Respond with JSON:
{
  "topicsCovered": ["specific topic 1", "specific topic 2"],
  "participantPositions": [
    {"name": "Person Name", "position": "Their specific stance"}
  ],
  "openQuestions": ["Actual question from thread?"],
  "suggestedDirection": "What ${sender.name} should focus on to advance the discussion",
  "emotionalTone": "collaborative|contentious|neutral|enthusiastic"
}`;

  try {
    // Use a fast model for thread analysis to avoid adding too much latency
    const result = await router.generateStructured<ThreadAnalysis>(
      'claude-haiku',
      prompt,
      { temperature: 0.3 }
    );
    return result;
  } catch (error) {
    console.warn('[Thread Analysis] Failed, proceeding without:', error);
    return null;
  }
}

async function generateEmail(
  sender: Character,
  recipients: Character[],
  thread: Thread,
  event: PlannedEvent,
  world: WorldState,
  router: ModelRouter,
  currentTime: Date,
  inReplyTo?: EmailId
): Promise<Email> {
  const emailId = uuid() as EmailId;
  const eventId = uuid() as EventId;

  // Get ALL thread emails for comprehensive context
  const threadEmails = world.emails
    .filter((e) => e.threadId === thread.id)
    .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());

  // Get previous messages - use MORE context (last 5 instead of 3)
  const previousMessages = inReplyTo
    ? threadEmails.slice(-5).map((e) => {
        const senderChar = world.characters.find((c) => c.id === e.from.characterId);
        return `From: ${senderChar?.name ?? e.from.displayName}\n${e.body}`;
      })
    : [];

  // Build enhanced context
  const { pointsAlreadyMade } = buildSenderHistoryContext(sender.id, threadEmails);
  const unansweredPoints = findUnansweredPoints(sender.id, threadEmails);

  // SEMANTIC THREAD ANALYSIS: Use cached or generate new analysis
  // This prevents redundant LLM calls for multiple emails in the same thread
  let threadAnalysis: ThreadAnalysis | null = null;
  if (threadEmails.length > 0 && sender.archetype !== 'spammer' && sender.archetype !== 'newsletter_curator') {
    threadAnalysis = await getCachedThreadAnalysis(thread.id, threadEmails, sender, world, router);

    // Update thread's conversation state with the analysis
    if (threadAnalysis && thread.conversationState) {
      thread.conversationState.discussedTopics = threadAnalysis.topicsCovered;
      // Map open questions to PendingQuestion format
      // Use the last email's sender as the asker since we don't know who specifically asked
      const lastEmail = threadEmails[threadEmails.length - 1];
      thread.conversationState.pendingQuestions = threadAnalysis.openQuestions.map((q) => ({
        question: q,
        askedBy: lastEmail?.from.characterId ?? sender.id,
        askedInEmail: lastEmail?.id ?? ('' as EmailId),
      }));
      thread.conversationState.currentFocus = threadAnalysis.suggestedDirection;
      // Update participant positions
      for (const pos of threadAnalysis.participantPositions) {
        const charId = world.characters.find((c) => c.name === pos.name)?.id;
        if (charId) {
          thread.conversationState.pointsByParticipant[charId] = [pos.position];
        }
      }
    }
  }

  // Build prompt with enhanced context including thread analysis
  const prompt = buildEmailPrompt(
    sender,
    recipients,
    thread.subject,
    event,
    previousMessages,
    world,
    pointsAlreadyMade,
    unansweredPoints,
    threadAnalysis ?? undefined
  );

  // Generate using character's bound model
  let body: string;
  let usedFallback = false;
  try {
    body = await router.generateAsCharacter(sender.id, prompt, {
      threadSubject: thread.subject,
      previousMessages,
      emotionalState: sender.emotionalState.current.dominantEmotion,
      characterKnowledge: sender.knows,
    });
  } catch (error) {
    // Fallback to varied template-based message with document context
    const errorMsg = error instanceof Error ? error.message : String(error);
    const modelId = sender.voiceBinding.modelId;

    // Categorize the error for better diagnostics
    let errorType: 'api_unavailable' | 'rate_limit' | 'invalid_request' | 'unknown' = 'unknown';
    if (errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('unavailable')) {
      errorType = 'api_unavailable';
    } else if (errorMsg.includes('429') || errorMsg.includes('rate')) {
      errorType = 'rate_limit';
    } else if (errorMsg.includes('400') || errorMsg.includes('invalid')) {
      errorType = 'invalid_request';
    }

    console.error(`[Email Generation] FAILED
    Character: ${sender.name} (${sender.archetype})
    Model: ${modelId}
    Error Type: ${errorType}
    Error: ${errorMsg}
    Event: ${event.description}
    Thread: ${thread.subject}`);

    // Pass document context to fallback for better quality
    body = generateFallbackEmail(sender, event, getMergedDocumentContext(world.documents));
    usedFallback = true;
  }

  // Validate document content was used (only for non-fallback, non-spam/newsletter)
  const docContext = getMergedDocumentContext(world.documents);
  if (!usedFallback && docContext?.coreConcepts?.length &&
      sender.archetype !== 'spammer' && sender.archetype !== 'newsletter_curator') {
    const emailLower = body.toLowerCase();
    const usedAnyConcept = docContext.coreConcepts.some(
      (concept) => emailLower.includes(concept.toLowerCase().slice(0, 12))
    );

    if (!usedAnyConcept) {
      console.warn(`[Email] WARNING: ${sender.name}'s email doesn't reference any document concepts`);
    }
  }

  // Log generation method for debugging
  if (usedFallback) {
    console.log(`[Email Generation] Generated fallback email for ${sender.name} (${sender.archetype})`);
  }

  // Determine folder
  let folder: Email['folder'] = 'inbox';
  if (sender.archetype === 'spammer') folder = 'spam';
  else if (sender.archetype === 'newsletter_curator') folder = 'newsletters';

  const email: Email = {
    id: emailId,
    threadId: thread.id,
    from: {
      characterId: sender.id,
      displayName: sender.name,
      address: sender.email,
    },
    to: recipients.map((r) => ({
      characterId: r.id,
      displayName: r.name,
      address: r.email,
    })),
    cc: [],
    subject: thread.subject,
    sentAt: currentTime,
    generatedAt: new Date(),
    body,
    bodyFormat: 'plain',
    type: inReplyTo ? 'thread_message' : getEmailType(sender, event),
    isRead: false,
    isStarred: false,
    folder,
    inReplyTo,
    references: inReplyTo ? [inReplyTo] : [],
    generatedBy: {
      characterId: sender.id,
      modelId: sender.voiceBinding.modelId,
      eventId,
      tick: world.tickCount,
    },
  };

  return email;
}

function buildEmailPrompt(
  sender: Character,
  recipients: Character[],
  subject: string,
  event: PlannedEvent,
  previousMessages: string[],
  world: WorldState,
  pointsAlreadyMade: string[] = [],
  unansweredPoints: string[] = [],
  threadAnalysis?: ThreadAnalysis
): string {
  const recipientNames = recipients.map((r) => r.name).join(', ');

  // Get document context if available - merged from ALL documents
  const docContext = getMergedDocumentContext(world.documents);
  const documentThesis = docContext?.thesis ?? '';
  const documentSummary = docContext?.summary ?? '';
  const documentSignificance = docContext?.significance ?? '';
  const documentClaims = docContext?.claims ?? [];
  const coreConcepts = docContext?.coreConcepts ?? [];
  const argumentStructure = docContext?.argumentStructure ?? [];

  // Include sender's full knowledge - don't truncate
  const senderKnowledge = sender.knows.join('\n- ');

  let contextInfo = '';

  // Add tension context
  if (event.affectedTensions.length > 0) {
    const tension = world.tensions.find((t) => t.id === event.affectedTensions[0]);
    if (tension) {
      contextInfo += `\nCurrent situation: ${tension.description}`;
    }
  }

  // Add goal context with progression tracking
  const relevantGoal = sender.goals.find((g) => g.priority === 'immediate');
  if (relevantGoal) {
    const goalStage = relevantGoal.stage ?? 'initial';
    const approachesTaken = relevantGoal.approachesTaken ?? [];

    if (goalStage === 'initial') {
      contextInfo += `\nYou're introducing: ${relevantGoal.description}`;
    } else if (approachesTaken.length > 0) {
      contextInfo += `\nYou're advancing: ${relevantGoal.description}`;
      contextInfo += `\nYou've already discussed: ${approachesTaken.slice(-2).join(', ')}`;
      contextInfo += `\nNow take a NEW angle or build on the conversation.`;
    }
  }

  // Special handling for archetypes
  if (sender.archetype === 'newsletter_curator') {
    const themes = world.documents.flatMap((d) => d.themes).slice(0, 4);
    const concepts = world.documents.flatMap((d) => d.concepts ?? []).slice(0, 8);

    return `Write a newsletter email about this document. Be substantive and specific.

═══════════════════════════════════════════════════════════════════════════════
DOCUMENT CONTENT (understand this thoroughly before writing)
═══════════════════════════════════════════════════════════════════════════════

MAIN THESIS:
${documentThesis}

FULL SUMMARY:
${documentSummary.slice(0, 1200)}

KEY TOPICS:
${themes.map((t) => `- ${t.name}: ${t.description}`).join('\n')}

KEY CONCEPTS AND THEIR CONNECTIONS (pick 2-3 to focus on deeply):
${concepts.map((c) =>
  `• ${c.name}: ${c.roleInDocument ?? c.definition?.slice(0, 150) ?? 'Key concept'}
    ${c.relationships?.slice(0, 2).map(r => `  → ${r.relationshipType}: ${r.targetConcept}`).join('\n') || ''}`
).join('\n')}

KEY CLAIMS WITH EVIDENCE (cite these for credibility):
${documentClaims.slice(0, 3).map((c) =>
  `• CLAIM: ${c.statement}
   EVIDENCE: ${c.evidence?.slice(0, 2).join('; ') || 'From document analysis'}`
).join('\n')}

WHY THIS MATTERS:
${documentSignificance}

═══════════════════════════════════════════════════════════════════════════════
WRITING REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════

Write an informative newsletter that:
1. Opens with a hook that captures the document's significance
2. Explains the main thesis in accessible but technically accurate terms
3. Dives DEEP into 2-3 key concepts - use actual terminology and specific details
4. Includes at least one specific claim or finding from the document
5. Connects the ideas to practical implications
6. Avoids vague corporate buzzwords - be concrete and specific

Length: 200-300 words. Substance over fluff.`;
  }

  if (sender.archetype === 'spammer') {
    return `Write a spam/promotional email. Be slightly over-the-top and promotional.
Include vague urgency and a call to action. Length: 50-100 words.`;
  }

  // Build rich document context section - CRITICAL for grounding emails in document
  let documentSection = '';
  if (documentThesis) {
    // Get rich concepts with relationships from all documents
    const richConcepts = getAllDocumentConcepts(world.documents).slice(0, 5);
    const focusClaim = documentClaims[Math.floor(Math.random() * Math.min(3, documentClaims.length))];

    // Build concept section with relationships if available
    const conceptSection = richConcepts.length > 0
      ? `KEY CONCEPTS AND CONNECTIONS:
${richConcepts.map(c =>
  `• ${c.name}: ${c.roleInDocument ?? c.definition?.slice(0, 80) ?? 'Key concept'}
    ${c.relationships?.slice(0, 2).map(r => `  → ${r.relationshipType}: ${r.targetConcept}`).join('\n') || ''}`
).join('\n')}`
      : `KEY CONCEPTS: ${coreConcepts.slice(0, 4).join(', ')}`;

    documentSection = `
═══════════════════════════════════════════════════════════════════════════════
⚠️ CRITICAL: YOUR EMAIL MUST REFERENCE THIS DOCUMENT ⚠️
═══════════════════════════════════════════════════════════════════════════════

THESIS: "${documentThesis}"

${conceptSection}

${focusClaim ? `CLAIM TO DISCUSS: ${focusClaim.statement}
EVIDENCE: ${focusClaim.evidence?.slice(0, 2).join('; ') || 'See document'}` : ''}

WHY THIS MATTERS: ${documentSignificance?.slice(0, 200) ?? 'Important findings'}

═══════════════════════════════════════════════════════════════════════════════
DOCUMENT SUMMARY (for context):
${documentSummary.slice(0, 800)}
${argumentStructure.length > 0 ? `

ARGUMENT FLOW (discussion should follow this logic):
${argumentStructure.slice(0, 3).map((a, i) => `${i + 1}. ${a.point}`).join('\n')}` : ''}
═══════════════════════════════════════════════════════════════════════════════

YOUR EMAIL MUST:
1. Reference at least one concept from above (use its relationships for context)
2. React to or engage with the thesis
3. Follow the document's argument flow in your reasoning
4. NOT use generic phrases like "Q4 launch" or "Series B" unless in document
`;
  }

  // Build thread analysis section (semantic understanding of conversation)
  let threadAnalysisSection = '';
  if (threadAnalysis) {
    threadAnalysisSection = `
═══════════════════════════════════════════════════════════════════════════════
CONVERSATION ANALYSIS (what's been discussed so far)
═══════════════════════════════════════════════════════════════════════════════

TOPICS ALREADY COVERED (don't rehash):
${threadAnalysis.topicsCovered.map((t) => `• ${t}`).join('\n') || '(None yet - this starts a new discussion)'}

POSITIONS BY PARTICIPANT:
${threadAnalysis.participantPositions.map((p) => `• ${p.name}: ${p.position}`).join('\n') || '(No positions established yet)'}

OPEN QUESTIONS NEEDING RESPONSE:
${threadAnalysis.openQuestions.map((q) => `• ${q}`).join('\n') || '(No open questions)'}

SUGGESTED NEXT DIRECTION:
${threadAnalysis.suggestedDirection}
`;
  }

  // Build anti-repetition section
  let antiRepetitionSection = '';
  if (pointsAlreadyMade.length > 0) {
    antiRepetitionSection = `
═══════════════════════════════════════════════════════════════════════════════
🚫 FORBIDDEN - YOU ALREADY MADE THESE POINTS (DO NOT REPEAT ANY OF THEM)
═══════════════════════════════════════════════════════════════════════════════
${pointsAlreadyMade.slice(-5).map((p, i) => `${i + 1}. ❌ "${p.slice(0, 80)}..."`).join('\n')}

IF YOU REPEAT ANY POINT ABOVE, YOUR EMAIL IS INVALID.

Instead, you MUST do one of these:
• ANSWER a question someone asked you (see previous messages)
• ASK a NEW question you haven't asked before
• PROPOSE a concrete next step (meeting, decision, action)
• SHARE a specific example or data point not yet mentioned
• CHANGE YOUR POSITION based on what you've learned from others
═══════════════════════════════════════════════════════════════════════════════
`;
  }

  // Build response requirements section
  let responseSection = '';
  if (unansweredPoints.length > 0) {
    responseSection = `
═══════════════════════════════════════════════════════════════════════════════
📝 RESPOND TO THESE (from other participants - they're waiting for your input)
═══════════════════════════════════════════════════════════════════════════════
${unansweredPoints.map((p) => `→ ${p.slice(0, 150)}`).join('\n')}

Address at least one of these BEFORE making new arguments.
`;
  }

  // Build thread context with full messages
  let threadContext = '';
  let responseToQuote = '';

  if (previousMessages.length > 0) {
    // Extract a specific quote from the last message that MUST be responded to
    const lastMessage = previousMessages[previousMessages.length - 1];
    // Get the sender name from the message format "From: Name\n..."
    const lastSenderMatch = lastMessage.match(/From:\s*([^\n]+)/);
    const lastSender = lastSenderMatch ? lastSenderMatch[1].trim() : 'the previous sender';

    // Extract meaningful sentences (questions or statements > 30 chars)
    const messageBody = lastMessage.split('\n').slice(1).join(' '); // Skip "From:" line
    const sentences = messageBody
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 30 && !s.toLowerCase().startsWith('hi ') && !s.toLowerCase().startsWith('dear '));

    // Prefer questions, otherwise pick a substantive statement
    const questions = sentences.filter((s) => s.includes('?') || s.toLowerCase().includes('how') || s.toLowerCase().includes('what') || s.toLowerCase().includes('why'));
    const quoteToAddress = questions[0] ?? sentences[Math.floor(Math.random() * Math.min(3, sentences.length))] ?? '';

    if (quoteToAddress) {
      responseToQuote = `
═══════════════════════════════════════════════════════════════════════════════
🎯 YOU MUST RESPOND TO THIS SPECIFIC POINT FROM ${lastSender}:
═══════════════════════════════════════════════════════════════════════════════

"${quoteToAddress.slice(0, 200)}"

YOUR RESPONSE MUST:
1. START by directly addressing this quote (agree, disagree, or answer the question)
2. Use phrases like "You asked about...", "Regarding your point on...", "To answer your question..."
3. THEN add your own perspective or follow-up
═══════════════════════════════════════════════════════════════════════════════
`;
    }

    threadContext = `
═══════════════════════════════════════════════════════════════════════════════
CONVERSATION SO FAR
═══════════════════════════════════════════════════════════════════════════════
${previousMessages.join('\n---\n')}
`;
  } else {
    threadContext = `
This is a NEW conversation. Start by:
1. Stating your main point or question clearly
2. Grounding it in specific document content
3. Inviting a specific response from ${recipientNames}
`;
  }

  // Enhanced prompt with full context
  return `You are ${sender.name}. Write an email to ${recipientNames}.
Subject: ${subject}
${contextInfo}
${documentSection}
YOUR KNOWLEDGE AND PERSPECTIVE:
${senderKnowledge ? `- ${senderKnowledge}` : 'General understanding of the topic'}
${responseToQuote}${threadContext}${threadAnalysisSection}${antiRepetitionSection}${responseSection}
═══════════════════════════════════════════════════════════════════════════════
WRITING REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════

1. Reference SPECIFIC concepts from the document (use actual terms like "${coreConcepts[0] ?? 'the key concept'}")
2. If replying, start by engaging with what the last person ACTUALLY said
3. Each email must have ONE clear purpose - don't ramble
4. Write as ${sender.name} - match their personality and perspective
5. Be concrete: use specific examples, numbers, or quotes from the document
6. Ask a genuine question or make a genuine point - don't just fill space

Trigger for this email: ${event.description}
Length: 75-150 words. Quality over quantity.`;
}

function getEmailType(sender: Character, event: PlannedEvent): Email['type'] {
  if (sender.archetype === 'newsletter_curator') return 'newsletter';
  if (sender.archetype === 'spammer') return 'spam';
  if (event.type === 'external') return 'automated';
  return 'standalone';
}

function generateFallbackEmail(
  sender: Character,
  event: PlannedEvent,
  docContext?: DocumentContext
): string {
  const greetings = sender.voiceBinding.voiceProfile.greetingPatterns;
  const signoffs = sender.voiceBinding.voiceProfile.signoffPatterns;
  const quirks = sender.voiceBinding.voiceProfile.quirks;
  const vocab = sender.voiceBinding.voiceProfile.vocabulary;

  // Pick random greeting and signoff for variety
  const greeting = greetings[Math.floor(Math.random() * greetings.length)] ?? 'Hi';
  const signoff = signoffs[Math.floor(Math.random() * signoffs.length)] ?? 'Best';

  // Generate content based on archetype, with document context
  const body = generateArchetypeSpecificBody(sender, event, vocab, quirks, docContext);

  return `${greeting},

${body}

${signoff},
${sender.name}`;
}

function generateArchetypeSpecificBody(
  sender: Character,
  event: PlannedEvent,
  vocab: string[],
  quirks: string[],
  docContext?: DocumentContext
): string {
  const topic = event.description.toLowerCase();
  const randomVocab = vocab.length > 0 ? vocab[Math.floor(Math.random() * vocab.length)] : '';
  const hasQuirk = quirks.length > 0 && Math.random() > 0.5;
  const quirk = hasQuirk ? ` ${quirks[Math.floor(Math.random() * quirks.length)]}` : '';

  // Extract document content for use in fallbacks
  const thesis = docContext?.thesis ?? '';
  const concepts = docContext?.coreConcepts?.slice(0, 4) ?? [];
  const claims = docContext?.claims?.slice(0, 2) ?? [];
  const significance = docContext?.significance ?? '';

  // Newsletter curator - use actual document content
  if (sender.archetype === 'newsletter_curator') {
    // If we have document context, use it for a substantive newsletter
    if (thesis || concepts.length > 0) {
      const conceptSection = concepts.length > 0
        ? `\n\nKey concepts explored:\n${concepts.map(c => `• ${c}`).join('\n')}`
        : '';

      const claimSection = claims.length > 0
        ? `\n\nNotable findings:\n${claims.map(c => `• ${c.statement.slice(0, 150)}`).join('\n')}`
        : '';

      const significanceSection = significance
        ? `\n\nWhy this matters: ${significance.slice(0, 200)}`
        : '';

      return `This week's focus: ${thesis.slice(0, 200) || 'recent developments'}.
${conceptSection}
${claimSection}
${significanceSection}

More analysis in upcoming editions.${quirk}`;
    }

    // Fallback without document context - still try to be substantive
    const sections = [
      `This week has been eventful! Here's what's happening with ${topic}.`,
      `We've got some updates to share regarding ${topic}.`,
      `Time for your regular briefing on ${topic}.`,
    ];
    return `${sections[Math.floor(Math.random() * sections.length)]}

We're tracking several developments that could reshape how we think about this space. Stay tuned for deeper analysis.${quirk}`;
  }

  // Spammer - promotional, urgent
  if (sender.archetype === 'spammer') {
    const openers = [
      `Don't miss out on this LIMITED TIME opportunity!`,
      `URGENT: This offer expires SOON!`,
      `You've been specially selected for an exclusive deal!`,
      `Act NOW before it's too late!`,
    ];
    const bodies = [
      `Our team has identified you as someone who deserves the BEST. Click now to claim your special reward!`,
      `Thousands are already benefiting from this amazing offer. Why aren't you?`,
      `This is your FINAL NOTICE. The opportunity of a lifetime awaits!`,
      `We're practically GIVING this away. But only for the next 24 hours!`,
    ];
    const ctas = [
      `Reply NOW to secure your spot!`,
      `Don't let this slip away - respond TODAY!`,
      `Time is running out. Act immediately!`,
    ];
    return `${openers[Math.floor(Math.random() * openers.length)]}

${bodies[Math.floor(Math.random() * bodies.length)]}

${ctas[Math.floor(Math.random() * ctas.length)]}`;
  }

  // Protagonist - confident, driving action
  if (sender.archetype === 'protagonist') {
    const templates = [
      `I've been thinking about ${topic} and I believe we need to take action. Let me outline my thoughts and get your perspective on how we move forward.`,
      `Regarding ${topic} - I've put together some ideas. I think we have a real opportunity here if we approach this right.${quirk}`,
      `I wanted to connect about ${topic}. There's some important ground to cover and I'd value your input on the direction we should take.`,
      `Quick note on ${topic}. I've been working on this and have some concrete proposals to share. Would love to discuss when you have a moment.`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  // Antagonist - challenging, questioning
  if (sender.archetype === 'antagonist') {
    const templates = [
      `I have concerns about ${topic}. Before we proceed, I think we need to reconsider some assumptions. I'm not convinced we're on the right track.`,
      `Regarding ${topic} - I've reviewed this carefully and I see some significant issues we haven't addressed. We should talk.${quirk}`,
      `I need to raise some objections about ${topic}. I know this might not be what you want to hear, but someone has to say it.`,
      `I'm pushing back on ${topic}. The current approach has problems and I think we need a different perspective here.`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  // Skeptic - cautious, analytical
  if (sender.archetype === 'skeptic') {
    const templates = [
      `I've been looking into ${topic} and I have some questions. Have we fully considered all the implications? I'd like to see more data.`,
      `On ${topic} - I'm not entirely sold yet. What's the evidence supporting this direction? I want to make sure we're not missing something.${quirk}`,
      `Before we commit to ${topic}, can we review the assumptions? I've found a few things that warrant closer examination.`,
      `I'm taking a careful look at ${topic}. There are some aspects that don't quite add up for me. Can we discuss?`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  // Enthusiast - excited, positive
  if (sender.archetype === 'enthusiast') {
    const templates = [
      `I'm really excited about ${topic}! This could be exactly what we need. I have so many ideas and can't wait to get started!`,
      `Great news about ${topic}! I've been thinking about this and I see so much potential here. Let's make this happen!${quirk}`,
      `Love the direction with ${topic}! This is going to be amazing. I'm all in and ready to contribute however I can!`,
      `${randomVocab ? randomVocab + '! ' : ''}The ${topic} stuff is fantastic! I'm genuinely pumped about where this could go.`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  // Default - professional, neutral
  const defaultTemplates = [
    `I wanted to touch base about ${topic}. Let me know your thoughts when you have a chance.${quirk}`,
    `Following up on ${topic}. Would be good to sync up on this soon.`,
    `Quick note regarding ${topic}. I have some updates to share and would appreciate your input.`,
    `Reaching out about ${topic}. There are a few things we should discuss.`,
    `Wanted to check in on ${topic}. Let me know if you have time to connect.`,
    `I've been working on ${topic} and wanted to loop you in. Happy to discuss further.`,
  ];
  return defaultTemplates[Math.floor(Math.random() * defaultTemplates.length)];
}

// =============================================================================
// WORLD STATE UPDATES
// =============================================================================

function updateWorldState(
  world: WorldState,
  events: PlannedEvent[],
  emails: Email[],
  _threads: Thread[],
  tickDuration: number
): { world: WorldState; changes: WorldStateChange[] } {
  const changes: WorldStateChange[] = [];

  // Update simulated time
  const newTime = new Date(world.simulatedTimeCurrent.getTime() + tickDuration);

  // Update tensions based on events
  for (const event of events) {
    for (const tensionId of event.affectedTensions) {
      const tension = world.tensions.find((t) => t.id === tensionId);
      if (tension) {
        tension.intensity = Math.min(1, tension.intensity + 0.1);

        // Advance tension status
        if (tension.status === 'building' && tension.intensity > 0.5) {
          tension.status = 'active';
          changes.push({
            type: 'tension_update',
            entityId: tension.id,
            description: `Tension escalated to active: ${tension.description}`,
          });
        }
      }
    }
  }

  // Decay inactive tensions
  for (const tension of world.tensions) {
    const wasAffected = events.some((e) => e.affectedTensions.includes(tension.id));
    if (!wasAffected && tension.status !== 'resolved') {
      tension.intensity = Math.max(0, tension.intensity - 0.05);
      if (tension.intensity <= 0.1 && tension.status === 'active') {
        tension.status = 'resolving';
        changes.push({
          type: 'tension_update',
          entityId: tension.id,
          description: `Tension resolving: ${tension.description}`,
        });
      }
    }
  }

  // Update character knowledge from emails
  for (const email of emails) {
    for (const recipient of email.to) {
      const char = world.characters.find((c) => c.id === recipient.characterId);
      if (char) {
        // Add thread subject as knowledge
        const knowledge = `Thread: ${email.subject}`;
        if (!char.knows.includes(knowledge)) {
          char.knows.push(knowledge);
        }
      }
    }
  }

  // NEW: Update goal progression for senders
  for (const email of emails) {
    const sender = world.characters.find((c) => c.id === email.from.characterId);
    if (!sender) continue;

    // Find the event that generated this email
    const eventIdx = emails.indexOf(email);
    const event = events[eventIdx];
    if (!event || !event.description.startsWith('Working on:')) continue;

    // Find the matching goal
    const goalDescription = event.description.replace('Working on: ', '');
    const goal = sender.goals.find((g) => g.description === goalDescription);

    if (goal) {
      // Track this email against the goal
      goal.emailsSent = goal.emailsSent ?? [];
      goal.emailsSent.push(email.id);

      // Update goal stage based on emails sent
      if (goal.emailsSent.length === 1) {
        goal.stage = 'in_progress';
      } else if (goal.emailsSent.length >= 3) {
        goal.stage = 'advanced';
      }

      // Track the approach taken (extract key phrase from email)
      goal.approachesTaken = goal.approachesTaken ?? [];
      const approach = extractApproachFromEmail(email.body);
      if (approach && !goal.approachesTaken.includes(approach)) {
        goal.approachesTaken.push(approach);
      }

      changes.push({
        type: 'character_update',
        entityId: sender.id,
        description: `Goal progressed: ${goal.description} (stage: ${goal.stage})`,
      });
    }
  }

  // Create new WorldState
  const newWorld: WorldState = {
    ...world,
    tickCount: world.tickCount + 1,
    lastTickAt: new Date(),
    simulatedTimeCurrent: newTime,
    emails: [...world.emails, ...emails],
    events: [
      ...world.events,
      ...events.map((e, i) => ({
        id: uuid() as EventId,
        tick: world.tickCount,
        simulatedTime: newTime,
        type: e.type,
        description: e.description,
        participants: e.participants,
        affectedTensions: e.affectedTensions,
        generatedEmails: emails.filter((_, j) => j === i).map((em) => em.id),
      })),
    ],
  };

  return { world: newWorld, changes };
}

// =============================================================================
// MAIN SIMULATION LOOP
// =============================================================================

export interface SimulationOptions {
  targetEmails: number;
  timeoutMs: number;
  tickDurationHours?: number;
  onTick?: (result: TickResult) => void;
}

/**
 * Run the simulation until target email count or timeout.
 */
export async function runSimulation(
  initialWorld: WorldState,
  router: ModelRouter,
  options: SimulationOptions
): Promise<{ world: WorldState; results: TickResult[] }> {
  const results: TickResult[] = [];
  let currentWorld = initialWorld;
  const startTime = Date.now();
  const tickDurationHours = options.tickDurationHours ?? 4;
  const tickDurationMs = tickDurationHours * 60 * 60 * 1000;

  while (
    currentWorld.emails.length < options.targetEmails &&
    Date.now() - startTime < options.timeoutMs
  ) {
    const tickStartTime = Date.now();
    const tickStartDate = currentWorld.simulatedTimeCurrent;

    // Plan events
    const plannedEvents = await planTickEvents(currentWorld, router, {
      targetEventsPerTick: 3,
      tickDurationHours,
    });

    // Generate emails
    const { emails, threads } = await generateEmailsFromEvents(
      plannedEvents,
      currentWorld,
      router,
      new Date(tickStartDate.getTime() + Math.random() * tickDurationMs)
    );

    // Log tick summary for debugging quality
    const fallbackIndicator = 'More insights coming soon';
    const fallbackCount = emails.filter((e) => e.body.includes(fallbackIndicator)).length;
    const docConcepts = getMergedDocumentContext(currentWorld.documents)?.coreConcepts ?? [];
    const conceptsUsed = new Set<string>();
    for (const email of emails) {
      for (const concept of docConcepts) {
        if (email.body.toLowerCase().includes(concept.toLowerCase().slice(0, 12))) {
          conceptsUsed.add(concept);
        }
      }
    }

    // Count unique senders to detect monologue issues
    const uniqueSenders = new Set(emails.map((e) => e.from.characterId)).size;

    console.log(
      `[Tick ${currentWorld.tickCount}] ${emails.length} emails | ` +
      `${fallbackCount} fallbacks | ` +
      `${conceptsUsed.size}/${docConcepts.length} concepts | ` +
      `${uniqueSenders} unique senders | ` +
      `${threads.length} new threads`
    );

    // Update world state
    const { world: newWorld, changes } = updateWorldState(
      currentWorld,
      plannedEvents,
      emails,
      threads,
      tickDurationMs
    );

    // Record tick result
    const result: TickResult = {
      tickNumber: currentWorld.tickCount,
      simulatedTimeStart: tickStartDate,
      simulatedTimeEnd: newWorld.simulatedTimeCurrent,
      events: newWorld.events.slice(-plannedEvents.length),
      newEmails: emails,
      worldStateChanges: changes,
      metrics: {
        eventsGenerated: plannedEvents.length,
        emailsGenerated: emails.length,
        tensionsResolved: changes.filter(
          (c) => c.type === 'tension_update' && c.description.includes('resolving')
        ).length,
        tensionsCreated: 0,
        durationMs: Date.now() - tickStartTime,
      },
    };

    results.push(result);
    options.onTick?.(result);

    currentWorld = newWorld;

    // Small delay to prevent API hammering
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return { world: currentWorld, results };
}

// =============================================================================
// TENSION INITIALIZATION
// =============================================================================

/**
 * Initialize tensions from document themes.
 */
export async function initializeTensions(
  themes: Theme[],
  characters: Character[],
  _router: ModelRouter
): Promise<Tension[]> {
  const tensions: Tension[] = [];

  // Create tensions from top themes
  for (const theme of themes.slice(0, 3)) {
    // Find characters who might be involved
    const protagonists = characters.filter((c) => c.archetype === 'protagonist');
    const antagonists = characters.filter((c) => c.archetype === 'antagonist');
    const skeptics = characters.filter((c) => c.archetype === 'skeptic');

    // Create conflict tension
    if (protagonists.length > 0 && (antagonists.length > 0 || skeptics.length > 0)) {
      tensions.push({
        id: uuid() as TensionId,
        type: 'conflict',
        participants: [
          protagonists[0].id,
          (antagonists[0] ?? skeptics[0]).id,
        ],
        description: `Disagreement about ${theme.name}`,
        intensity: 0.3,
        status: 'building',
        relatedThemes: [theme.id],
        createdAtTick: 0,
      });
    }
  }

  // Create mystery tension if there's an insider
  const insider = characters.find((c) => c.archetype === 'insider');
  if (insider) {
    tensions.push({
      id: uuid() as TensionId,
      type: 'secret',
      participants: [insider.id],
      description: 'Hidden information that could change everything',
      intensity: 0.4,
      status: 'building',
      relatedThemes: themes.slice(0, 1).map((t) => t.id),
      createdAtTick: 0,
    });
  }

  return tensions;
}
