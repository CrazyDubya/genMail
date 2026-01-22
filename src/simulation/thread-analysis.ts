/**
 * Thread Analysis
 *
 * Semantic understanding of email conversations using LLM analysis.
 */

import type {
  ThreadId,
  Email,
  Character,
  WorldState,
} from '../types.js';
import type { ModelRouter } from '../models/router.js';
import { getMergedDocumentContext } from './context-utils.js';

export interface ThreadAnalysis {
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
export async function getCachedThreadAnalysis(
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
  const transcript = threadEmails
    .map(e => {
      const senderChar = world.characters.find(c => c.id === e.from.characterId);
      return `[${senderChar?.name ?? e.from.displayName}]: ${e.body}`;
    })
    .join('\n\n');

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
