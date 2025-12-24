/**
 * Conversation Summarization Utilities
 *
 * Reduces token usage by summarizing older messages in threads.
 * Instead of sending full conversation history, we:
 * 1. Keep recent messages in full
 * 2. Summarize older messages into a compact context
 *
 * This enables longer threads without exponential token growth.
 */

import type { Email, Thread, Character } from '../types.js';
import type { ModelRouter } from '../models/router.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ThreadSummary {
  /** Unique ID for this summary */
  id: string;
  /** Thread being summarized */
  threadId: string;
  /** Number of emails summarized */
  emailCount: number;
  /** Compact summary of the conversation */
  summary: string;
  /** Key points discussed */
  keyPoints: string[];
  /** Current state of any debates/tensions */
  currentState: string;
  /** Who participated and their stances */
  participantStances: Map<string, string>;
  /** When this summary was generated */
  generatedAt: Date;
  /** Token count of the summary */
  tokenEstimate: number;
}

export interface SummarizedContext {
  /** Summary of older messages */
  historySummary: string;
  /** Recent messages kept in full */
  recentMessages: Email[];
  /** Total messages in thread */
  totalMessages: number;
  /** Messages summarized */
  summarizedCount: number;
  /** Token savings estimate */
  tokenSavings: number;
}

export interface SummarizationConfig {
  /** Number of recent messages to keep in full */
  keepRecentCount: number;
  /** Maximum tokens for summary */
  maxSummaryTokens: number;
  /** Minimum messages before summarizing */
  minMessagesForSummary: number;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

export const DEFAULT_SUMMARIZATION_CONFIG: SummarizationConfig = {
  keepRecentCount: 3,
  maxSummaryTokens: 500,
  minMessagesForSummary: 5,
};

// =============================================================================
// SUMMARIZATION FUNCTIONS
// =============================================================================

/**
 * Get summarized context for a thread.
 * Returns recent messages in full and a summary of older messages.
 */
export async function getSummarizedThreadContext(
  thread: Thread,
  emails: Email[],
  characters: Map<string, Character>,
  router: ModelRouter,
  config: SummarizationConfig = DEFAULT_SUMMARIZATION_CONFIG
): Promise<SummarizedContext> {
  // Sort emails by date
  const sortedEmails = [...emails].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
  );

  // If not enough messages, return all in full
  if (sortedEmails.length < config.minMessagesForSummary) {
    return {
      historySummary: '',
      recentMessages: sortedEmails,
      totalMessages: sortedEmails.length,
      summarizedCount: 0,
      tokenSavings: 0,
    };
  }

  // Split into older (to summarize) and recent (keep full)
  const splitIndex = Math.max(0, sortedEmails.length - config.keepRecentCount);
  const olderEmails = sortedEmails.slice(0, splitIndex);
  const recentEmails = sortedEmails.slice(splitIndex);

  if (olderEmails.length === 0) {
    return {
      historySummary: '',
      recentMessages: recentEmails,
      totalMessages: sortedEmails.length,
      summarizedCount: 0,
      tokenSavings: 0,
    };
  }

  // Generate summary of older emails
  const historySummary = await summarizeEmails(
    olderEmails,
    thread,
    characters,
    router,
    config.maxSummaryTokens
  );

  // Estimate token savings
  const oldTokens = estimateTokens(olderEmails);
  const summaryTokens = Math.ceil(historySummary.length / 4);
  const tokenSavings = Math.max(0, oldTokens - summaryTokens);

  return {
    historySummary,
    recentMessages: recentEmails,
    totalMessages: sortedEmails.length,
    summarizedCount: olderEmails.length,
    tokenSavings,
  };
}

/**
 * Summarize a list of emails into a compact context.
 */
async function summarizeEmails(
  emails: Email[],
  thread: Thread,
  characters: Map<string, Character>,
  router: ModelRouter,
  maxTokens: number
): Promise<string> {
  // Build context for summarization
  const emailDescriptions = emails.map((email) => {
    const sender = characters.get(email.from.characterId);
    const senderName = sender?.name || email.from.displayName;
    const excerpt =
      email.body.length > 200 ? email.body.slice(0, 200) + '...' : email.body;
    return `[${senderName}]: ${excerpt}`;
  });

  const prompt = `Summarize this email thread conversation in ${maxTokens} tokens or less.

Thread subject: "${thread.subject}"

Messages to summarize (${emails.length} emails):
${emailDescriptions.join('\n\n')}

Provide a concise summary that captures:
1. The main topic and purpose of the discussion
2. Key points raised by different participants
3. Any decisions made or questions asked
4. The current state of the conversation

Write in third person, past tense. Be factual and brief.`;

  try {
    const summary = await router.generate('gemini-flash', prompt, {
      temperature: 0.3,
      maxTokens,
    });
    return summary;
  } catch {
    console.warn('[Summarize] Failed to generate summary, using fallback');
    return generateFallbackSummary(emails, characters);
  }
}

/**
 * Generate a simple fallback summary without LLM.
 */
function generateFallbackSummary(
  emails: Email[],
  characters: Map<string, Character>
): string {
  const participants = new Set<string>();
  for (const email of emails) {
    const sender = characters.get(email.from.characterId);
    participants.add(sender?.name || email.from.displayName);
  }

  const participantList = Array.from(participants).slice(0, 5).join(', ');

  return `Previous discussion (${emails.length} messages) between ${participantList}. Topics covered the ongoing thread conversation.`;
}

/**
 * Estimate token count for a list of emails.
 */
function estimateTokens(emails: Email[]): number {
  let totalChars = 0;
  for (const email of emails) {
    totalChars += email.subject.length;
    totalChars += email.body.length;
    totalChars += email.from.displayName.length;
    for (const recipient of email.to) {
      totalChars += recipient.displayName.length;
    }
  }
  return Math.ceil(totalChars / 4);
}

// =============================================================================
// CONTEXT FORMATTING
// =============================================================================

/**
 * Format summarized context for injection into email generation prompt.
 */
export function formatSummarizedContext(context: SummarizedContext): string {
  const parts: string[] = [];

  if (context.historySummary) {
    parts.push('=== Earlier in this thread ===');
    parts.push(context.historySummary);
    parts.push('');
  }

  if (context.recentMessages.length > 0) {
    parts.push('=== Recent messages ===');
    for (const email of context.recentMessages) {
      parts.push(`From: ${email.from.displayName}`);
      parts.push(`Subject: ${email.subject}`);
      parts.push(email.body);
      parts.push('---');
    }
  }

  return parts.join('\n');
}

/**
 * Build optimized thread context that balances detail with token efficiency.
 * Uses summarization for older messages, full text for recent ones.
 */
export async function buildOptimizedThreadContext(
  thread: Thread,
  emails: Email[],
  characters: Map<string, Character>,
  router: ModelRouter,
  config?: Partial<SummarizationConfig>
): Promise<{
  context: string;
  tokenEstimate: number;
  summarizedCount: number;
}> {
  const fullConfig = { ...DEFAULT_SUMMARIZATION_CONFIG, ...config };

  const summarizedContext = await getSummarizedThreadContext(
    thread,
    emails,
    characters,
    router,
    fullConfig
  );

  const formattedContext = formatSummarizedContext(summarizedContext);
  const tokenEstimate = Math.ceil(formattedContext.length / 4);

  return {
    context: formattedContext,
    tokenEstimate,
    summarizedCount: summarizedContext.summarizedCount,
  };
}
