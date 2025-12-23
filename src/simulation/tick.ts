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
// EVENT PLANNING
// =============================================================================

interface PlannedEvent {
  type: EventType;
  description: string;
  participants: CharacterId[];
  affectedTensions: TensionId[];
  shouldGenerateEmail: boolean;
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

  // Plan tension-driven events
  for (const tension of activeTensions.slice(0, 2)) {
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

  // Plan character-driven events
  const activeCharacters = characters.filter(
    (c) => c.emailBehavior.frequency === 'prolific' ||
           (c.emailBehavior.frequency === 'moderate' && Math.random() > 0.5)
  );

  for (const character of activeCharacters.slice(0, targetEvents - events.length)) {
    // Check if character has urgent goals
    const urgentGoal = character.goals.find((g) => g.priority === 'immediate');

    if (urgentGoal) {
      events.push({
        type: 'communication',
        description: `Working on: ${urgentGoal.description}`,
        participants: [character.id],
        affectedTensions: [],
        shouldGenerateEmail: true,
      });
    }
  }

  // Add newsletter if we have a curator
  const curator = world.characters.find((c) => c.archetype === 'newsletter_curator');
  if (curator && world.tickCount % 3 === 0) {
    events.push({
      type: 'external',
      description: 'Newsletter publication',
      participants: [curator.id],
      affectedTensions: [],
      shouldGenerateEmail: true,
    });
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
    const existingThread = findRelatedThread(event, world, sender, recipients);
    let inReplyTo: EmailId | undefined;
    let thread: Thread;

    if (!existingThread) {
      // Create new thread
      const threadId = uuid() as ThreadId;
      thread = {
        id: threadId,
        subject: generateSubject(event, sender, world),
        participants: [sender.id, ...recipients.map((r) => r.id)],
        emails: [],
        startedAt: currentTime,
        lastActivityAt: currentTime,
        messageCount: 0,
        relatedTensions: event.affectedTensions,
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

  // For spam
  if (sender.archetype === 'spammer') {
    const spamSubjects = [
      '🚨 URGENT: You\'ve been selected!',
      'Limited Time Offer - Act Now!',
      'Re: Your Account Status',
      'Important Update Required',
      'Congratulations! You Won!',
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

  // Get previous messages in thread for context
  const previousMessages = inReplyTo
    ? world.emails
        .filter((e) => e.threadId === thread.id)
        .slice(-3)
        .map((e) => `From: ${e.from.displayName}\n${e.body}`)
    : [];

  // Build prompt
  const prompt = buildEmailPrompt(
    sender,
    recipients,
    thread.subject,
    event,
    previousMessages,
    world
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
    // Fallback to varied template-based message
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`[Email Generation] LLM failed for ${sender.name} (${sender.archetype}), using fallback. Error: ${errorMsg}`);
    body = generateFallbackEmail(sender, event);
    usedFallback = true;
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
  world: WorldState
): string {
  const recipientNames = recipients.map((r) => r.name).join(', ');

  // NEW: Get document context if available
  const docContext = world.documents[0]?.context;
  const documentThesis = docContext?.thesis ?? '';
  const documentSignificance = docContext?.significance ?? '';

  // NEW: Include sender's actual knowledge
  const senderKnowledge = sender.knows.slice(0, 5).join('\n- ');

  let contextInfo = '';

  // Add tension context
  if (event.affectedTensions.length > 0) {
    const tension = world.tensions.find((t) => t.id === event.affectedTensions[0]);
    if (tension) {
      contextInfo += `\nCurrent situation: ${tension.description}`;
    }
  }

  // Add goal context
  const relevantGoal = sender.goals.find((g) => g.priority === 'immediate');
  if (relevantGoal) {
    contextInfo += `\nYou're working on: ${relevantGoal.description}`;
  }

  // Special handling for archetypes
  if (sender.archetype === 'newsletter_curator') {
    const themes = world.documents.flatMap((d) => d.themes).slice(0, 4);
    const concepts = world.documents.flatMap((d) => d.concepts ?? []).slice(0, 6);

    return `Write a newsletter email about this document.

DOCUMENT OVERVIEW:
${documentThesis}

KEY TOPICS:
${themes.map((t) => `- ${t.name}: ${t.description}`).join('\n')}

KEY CONCEPTS TO DISCUSS (pick 2-3 to focus on):
${concepts.map((c) => `- ${c.name}: ${c.definition.slice(0, 200)}`).join('\n')}

WHY THIS MATTERS:
${documentSignificance.slice(0, 200)}

Write an informative newsletter that:
- Explains the main thesis in accessible, engaging terms
- Dives deep into 2-3 key concepts with real technical substance
- Connects the ideas to practical implications or applications
- Uses varied language - avoid corporate buzzwords like "synergy", "leverage", "circle back"

Keep it well-structured with clear sections. Length: 200-300 words.`;
  }

  if (sender.archetype === 'spammer') {
    return `Write a spam/promotional email. Be slightly over-the-top and promotional.
Include vague urgency and a call to action. Length: 50-100 words.`;
  }

  // NEW: Enhanced prompt with document context and character knowledge
  return `Write an email to ${recipientNames}.
Subject: ${subject}
${contextInfo}

DOCUMENT CONTEXT (what you're discussing):
${documentThesis.slice(0, 500)}

YOUR KNOWLEDGE (use this in the email):
- ${senderKnowledge || 'General understanding of the topic'}

${previousMessages.length > 0 ? `This is a reply in an ongoing thread.\n` : 'This is a new email.\n'}

Event: ${event.description}

IMPORTANT GUIDELINES:
1. Reference SPECIFIC concepts, methods, or findings from the document - don't be vague or generic
2. Use VARIED vocabulary - avoid repeating the same phrases like "circle back", "align on", "nail down"
3. Show genuine understanding - discuss implications, ask insightful questions, or share relevant perspectives
4. Each email should have a DISTINCT focus or angle on the topic
5. Write naturally as this specific character would - use their voice and personality

Length: 75-200 words.`;
}

function getEmailType(sender: Character, event: PlannedEvent): Email['type'] {
  if (sender.archetype === 'newsletter_curator') return 'newsletter';
  if (sender.archetype === 'spammer') return 'spam';
  if (event.type === 'external') return 'automated';
  return 'standalone';
}

function generateFallbackEmail(sender: Character, event: PlannedEvent): string {
  const greetings = sender.voiceBinding.voiceProfile.greetingPatterns;
  const signoffs = sender.voiceBinding.voiceProfile.signoffPatterns;
  const quirks = sender.voiceBinding.voiceProfile.quirks;
  const vocab = sender.voiceBinding.voiceProfile.vocabulary;

  // Pick random greeting and signoff for variety
  const greeting = greetings[Math.floor(Math.random() * greetings.length)] ?? 'Hi';
  const signoff = signoffs[Math.floor(Math.random() * signoffs.length)] ?? 'Best';

  // Generate content based on archetype
  const body = generateArchetypeSpecificBody(sender, event, vocab, quirks);

  return `${greeting},

${body}

${signoff},
${sender.name}`;
}

function generateArchetypeSpecificBody(
  sender: Character,
  event: PlannedEvent,
  vocab: string[],
  quirks: string[]
): string {
  const topic = event.description.toLowerCase();
  const randomVocab = vocab.length > 0 ? vocab[Math.floor(Math.random() * vocab.length)] : '';
  const hasQuirk = quirks.length > 0 && Math.random() > 0.5;
  const quirk = hasQuirk ? ` ${quirks[Math.floor(Math.random() * quirks.length)]}` : '';

  // Newsletter curator - detailed, informative content
  if (sender.archetype === 'newsletter_curator') {
    const sections = [
      `This week has been eventful! Here's what's happening with ${topic}.`,
      `We've got some exciting updates to share regarding ${topic}.`,
      `Time for your regular briefing on ${topic}.`,
    ];
    const details = [
      `Several developments have caught our attention. The team has been working hard on key initiatives, and we're seeing real progress.`,
      `Things are moving forward nicely. We've hit some milestones and there's momentum building.`,
      `There's been good activity across the board. Multiple projects are advancing and new opportunities are emerging.`,
    ];
    const closings = [
      `Stay tuned for more updates next week. As always, reach out if you have questions.`,
      `More to come soon. Keep an eye out for announcements.`,
      `That's all for now. Looking forward to sharing more progress with you.`,
    ];
    return `${sections[Math.floor(Math.random() * sections.length)]}

${details[Math.floor(Math.random() * details.length)]}

${closings[Math.floor(Math.random() * closings.length)]}${quirk}`;
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
