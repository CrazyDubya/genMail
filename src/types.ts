/**
 * EmailVerse Core Types
 *
 * Foundational types for the entire system.
 */

// ============================================================================
// IDENTIFIERS (branded types for type safety)
// ============================================================================

export type CharacterId = string & { readonly __brand: 'CharacterId' };
export type EmailId = string & { readonly __brand: 'EmailId' };
export type ThreadId = string & { readonly __brand: 'ThreadId' };
export type DocumentId = string & { readonly __brand: 'DocumentId' };
export type TensionId = string & { readonly __brand: 'TensionId' };
export type TaskId = string & { readonly __brand: 'TaskId' };
export type EventId = string & { readonly __brand: 'EventId' };
export type UniverseId = string & { readonly __brand: 'UniverseId' };

// ID factories
export const createCharacterId = (id: string): CharacterId => id as CharacterId;
export const createEmailId = (id: string): EmailId => id as EmailId;
export const createThreadId = (id: string): ThreadId => id as ThreadId;
export const createDocumentId = (id: string): DocumentId => id as DocumentId;
export const createTensionId = (id: string): TensionId => id as TensionId;
export const createTaskId = (id: string): TaskId => id as TaskId;
export const createEventId = (id: string): EventId => id as EventId;
export const createUniverseId = (id: string): UniverseId => id as UniverseId;

// ============================================================================
// MODEL CONFIGURATION
// ============================================================================

export type ModelIdentifier =
  | 'claude-opus'
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'gpt-4o-mini'
  | 'gemini-flash'
  | 'grok-fast'
  | 'openrouter-cheap'
  | 'openrouter-gpt-nano'  // GPT-5.2 nano via OpenRouter (fallback for direct OpenAI)
  | 'openrouter-haiku'    // Claude Haiku via OpenRouter (fallback)
  | 'openrouter-flash';   // Gemini Flash via OpenRouter (fallback)

export interface ModelConfig {
  anthropic: { apiKey: string };
  openai: { apiKey: string };
  google: { apiKey: string };
  xai: { apiKey: string };
  openrouter: { apiKey: string; defaultModel: string };
}

// ============================================================================
// DOCUMENTS
// ============================================================================

export interface RawDocument {
  id: DocumentId;
  filename: string;
  mimeType: string;
  content: string;
  uploadedAt: Date;
}

export interface ProcessedDocument {
  id: DocumentId;
  raw: RawDocument;
  /** Document-level understanding (thesis, structure, significance) */
  context: DocumentContext;
  chunks: DocumentChunk[];
  /** Concepts extracted WITH document context (replaces shallow entity extraction) */
  concepts: ExtractedConcept[];
  /** Legacy entity extraction (kept for compatibility) */
  extractedEntities: ExtractedEntity[];
  themes: Theme[];
  processingMetadata: {
    chunkCount: number;
    tokenEstimate: number;
    processingTimeMs: number;
  };
}

export interface DocumentChunk {
  id: string;
  documentId: DocumentId;
  content: string;
  startOffset: number;
  endOffset: number;
  tokenEstimate: number;
  /** Which section this chunk belongs to (if structure detected) */
  sectionTitle?: string;
  /** Index within the document for ordering */
  chunkIndex: number;
  /** Optional embedding vector for semantic search (set during processing if embeddings enabled) */
  embedding?: number[];
}

// ============================================================================
// EXTRACTION
// ============================================================================

export interface ExtractedEntity {
  id: string;
  type: 'person' | 'organization' | 'concept' | 'event' | 'location';
  name: string;
  aliases: string[];
  mentions: EntityMention[];
  attributes: Record<string, unknown>;
  confidence: number;
}

export interface EntityMention {
  chunkId: string;
  context: string;
  sentiment?: number;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  relevantChunks: string[];
  weight: number;
}

// ============================================================================
// DOCUMENT UNDERSTANDING (Concept-First Extraction)
// ============================================================================

export type DocumentType =
  | 'academic_paper'
  | 'technical_doc'
  | 'article'
  | 'book_chapter'
  | 'transcript'
  | 'email_thread'
  | 'report'
  | 'unknown';

export interface DocumentContext {
  /** What type of document is this? */
  documentType: DocumentType;
  /** One-paragraph summary of the document's main point */
  thesis: string;
  /** Extended summary with key details (500-800 words) */
  summary: string;
  /** The main argument or narrative structure */
  argumentStructure: ArgumentPoint[];
  /** Core concepts that define this document */
  coreConcepts: string[];
  /** Detected sections/structure */
  structure: DocumentSection[];
  /** Key claims made and their evidence */
  claims: Claim[];
  /** What makes this document significant/novel */
  significance: string;
}

export interface ArgumentPoint {
  point: string;
  supporting: string[];
  order: number;
}

export interface DocumentSection {
  title: string;
  startOffset: number;
  endOffset: number;
  summary?: string;
}

export interface Claim {
  statement: string;
  evidence: string[];
  confidence: number;
}

export interface ExtractedConcept {
  id: string;
  /** The concept name */
  name: string;
  /** What this concept means IN THIS DOCUMENT'S CONTEXT */
  definition: string;
  /** Why this concept matters to the document's thesis */
  roleInDocument: string;
  /** How it relates to other concepts */
  relationships: ConceptRelationship[];
  /** Specific details, formulas, examples from the text */
  details: string[];
  /** Which chunks this concept appears in */
  sourceChunks: string[];
  /** Importance to overall document (0-1) */
  importance: number;
}

export interface ConceptRelationship {
  targetConcept: string;
  relationshipType: 'is-a' | 'part-of' | 'uses' | 'enables' | 'contrasts-with' | 'extends' | 'implements' | 'requires';
  description: string;
}

export interface ConceptHierarchy {
  /** Root concepts (top-level ideas) */
  roots: string[];
  /** Parent-child relationships */
  hierarchy: Map<string, string[]>;
  /** Cross-cutting relationships */
  crossLinks: Array<{ from: string; to: string; type: string }>;
}

// ============================================================================
// CHARACTERS
// ============================================================================

export interface Character {
  id: CharacterId;
  name: string;
  email: string;
  role: string;
  origin: 'intrinsic' | 'extrinsic';
  sourceEntityId?: string;
  archetype?: CharacterArchetype;
  voiceBinding: VoiceBinding;
  goals: Goal[];
  secrets: Secret[];
  beliefs: Belief[];
  emotionalState: EmotionalState;
  emailBehavior: EmailBehavior;
  knows: string[];
  suspects: string[];
}

export type CharacterArchetype =
  | 'protagonist'
  | 'antagonist'
  | 'skeptic'
  | 'enthusiast'
  | 'expert'
  | 'newcomer'
  | 'spammer'
  | 'newsletter_curator'
  | 'insider'
  | 'outsider';

export interface VoiceBinding {
  modelId: ModelIdentifier;
  voiceProfile: VoiceProfile;
}

export interface VoiceProfile {
  formality: number;
  verbosity: number;
  emojiUsage: number;
  punctuationStyle: 'standard' | 'minimal' | 'expressive';
  vocabulary: string[];
  greetingPatterns: string[];
  signoffPatterns: string[];
  quirks: string[];
  sampleOutputs: string[];
}

export interface Goal {
  id: string;
  description: string;
  priority: 'immediate' | 'short-term' | 'long-term';
  relatedTensions?: TensionId[];
  /** Track emails sent pursuing this goal (for anti-repetition) */
  emailsSent?: EmailId[];
  /** Track the progression stage of this goal */
  stage?: 'initial' | 'in_progress' | 'advanced' | 'completed';
  /** Specific angles/approaches already taken for this goal */
  approachesTaken?: string[];
}

export interface Secret {
  id: string;
  description: string;
  knownBy: CharacterId[];
}

export interface Belief {
  id: string;
  statement: string;
  strength: number;
}

export interface EmotionalState {
  baseline: 'optimistic' | 'neutral' | 'pessimistic' | 'anxious' | 'confident';
  current: {
    valence: number;
    arousal: number;
    dominantEmotion: string;
  };
}

export interface EmailBehavior {
  frequency: 'prolific' | 'moderate' | 'sparse';
  responseLatency: 'immediate' | 'thoughtful' | 'delayed';
  typicalLength: 'brief' | 'moderate' | 'lengthy';
  threadParticipation: 'initiator' | 'responder' | 'lurker' | 'mixed';
}

// ============================================================================
// RELATIONSHIPS
// ============================================================================

export interface Relationship {
  id: string;
  participants: [CharacterId, CharacterId];
  type: RelationshipType;
  strength: number;
  sentiment: number;
}

export type RelationshipType =
  | 'colleagues'
  | 'friends'
  | 'rivals'
  | 'mentor-mentee'
  | 'collaborators'
  | 'adversaries'
  | 'acquaintances'
  | 'strangers';

// ============================================================================
// TENSIONS
// ============================================================================

export interface Tension {
  id: TensionId;
  type: TensionType;
  participants: CharacterId[];
  description: string;
  intensity: number;
  status: 'building' | 'active' | 'climax' | 'resolving' | 'resolved';
  relatedThemes: string[];
  createdAtTick: number;
  resolvedAtTick?: number;
}

export type TensionType =
  | 'conflict'
  | 'secret'
  | 'desire'
  | 'mystery'
  | 'alliance'
  | 'competition'
  | 'revelation'
  | 'betrayal'
  | 'opportunity';

// ============================================================================
// WORLD STATE
// ============================================================================

export interface WorldState {
  id: UniverseId;
  createdAt: Date;
  lastTickAt: Date;
  tickCount: number;
  simulatedTimeStart: Date;
  simulatedTimeCurrent: Date;
  characters: Character[];
  relationships: Relationship[];
  tensions: Tension[];
  facts: Fact[];
  events: SimulatedEvent[];
  emails: Email[];
  documents: ProcessedDocument[];
  config: WorldConfig;
}

export interface WorldConfig {
  targetEmailCount: number;
  characterCount: { min: number; max: number };
  extrinsicArchetypes: CharacterArchetype[];
  tensionDensity: number;
  spamRatio: number;
  newsletterFrequency: number;
}

export interface Fact {
  id: string;
  statement: string;
  source: 'document' | 'inferred' | 'simulated';
  confidence: number;
  relatedEntities: string[];
}

// ============================================================================
// SIMULATION
// ============================================================================

export interface SimulatedEvent {
  id: EventId;
  tick: number;
  simulatedTime: Date;
  type: EventType;
  description: string;
  participants: CharacterId[];
  affectedTensions: TensionId[];
  generatedEmails: EmailId[];
}

export type EventType =
  | 'communication'
  | 'discovery'
  | 'decision'
  | 'conflict'
  | 'resolution'
  | 'external';

export interface TickResult {
  tickNumber: number;
  simulatedTimeStart: Date;
  simulatedTimeEnd: Date;
  events: SimulatedEvent[];
  newEmails: Email[];
  worldStateChanges: WorldStateChange[];
  metrics: TickMetrics;
}

export interface WorldStateChange {
  type: 'character_update' | 'tension_update' | 'relationship_update' | 'new_fact';
  entityId: string;
  description: string;
}

export interface TickMetrics {
  eventsGenerated: number;
  emailsGenerated: number;
  tensionsResolved: number;
  tensionsCreated: number;
  durationMs: number;
}

// ============================================================================
// EMAILS
// ============================================================================

export interface Email {
  id: EmailId;
  threadId: ThreadId;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  sentAt: Date;
  generatedAt: Date;
  body: string;
  bodyFormat: 'plain' | 'html';
  type: EmailType;
  isRead: boolean;
  isStarred: boolean;
  folder: FolderType;
  inReplyTo?: EmailId;
  references: EmailId[];
  generatedBy: {
    characterId: CharacterId;
    modelId: ModelIdentifier;
    eventId: EventId;
    tick: number;
  };
  corruption?: CorruptionEffect;
}

export interface EmailAddress {
  characterId: CharacterId;
  displayName: string;
  address: string;
}

export type EmailType =
  | 'thread_message'
  | 'standalone'
  | 'newsletter'
  | 'spam'
  | 'automated'
  | 'forward';

export type FolderType =
  | 'inbox'
  | 'sent'
  | 'spam'
  | 'newsletters'
  | 'flagged'
  | 'trash';

export interface CorruptionEffect {
  type: 'redacted' | 'partial' | 'glitched' | 'fragmented';
  severity: number;
}

export interface Thread {
  id: ThreadId;
  subject: string;
  participants: CharacterId[];
  emails: EmailId[];
  startedAt: Date;
  lastActivityAt: Date;
  messageCount: number;
  relatedTensions: TensionId[];
  /** Track the type of communication that started this thread */
  originType: 'communication' | 'spam' | 'newsletter' | 'external';
  /** Track conversation state for coherent threading */
  conversationState?: ConversationState;
}

export interface ConversationState {
  /** Questions that have been asked but not answered */
  pendingQuestions: PendingQuestion[];
  /** Key points each participant has made (for anti-repetition) */
  pointsByParticipant: Record<string, string[]>;
  /** Topics that have been discussed */
  discussedTopics: string[];
  /** The current conversation direction/focus */
  currentFocus?: string;
}

export interface PendingQuestion {
  askedBy: CharacterId;
  question: string;
  askedInEmail: EmailId;
  addressedBy?: CharacterId;
}

// ============================================================================
// TASKS
// ============================================================================

export interface Task<T = unknown, R = unknown> {
  id: TaskId;
  type: TaskType;
  payload: T;
  dependencies: TaskId[];
  status: TaskStatus;
  priority: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: R;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export type TaskStatus = 'pending' | 'blocked' | 'running' | 'complete' | 'failed';

export type TaskType =
  | 'chunk_document'
  | 'extract_entities'
  | 'merge_extractions'
  | 'infer_relationships'
  | 'identify_themes'
  | 'generate_character'
  | 'generate_voice_samples'
  | 'bind_character_model'
  | 'plan_tick_events'
  | 'execute_event'
  | 'update_world_state'
  | 'plan_email'
  | 'generate_email'
  | 'review_email'
  | 'assemble_thread'
  | 'coherence_check'
  | 'voice_consistency_check';

// ============================================================================
// API TYPES
// ============================================================================

export interface CreateUniverseRequest {
  documents: Array<{ filename: string; content: string; mimeType: string }>;
  config?: Partial<WorldConfig>;
}

export interface CreateUniverseResponse {
  universeId: string;
  status: 'processing';
  estimatedCompletionMs: number;
}

export interface UniverseStatusResponse {
  universeId: string;
  status: 'processing' | 'complete' | 'failed';
  progress: {
    phase: 'documents' | 'characters' | 'simulation' | 'complete';
    percentComplete: number;
    currentTask?: string;
  };
  stats?: {
    documentCount: number;
    characterCount: number;
    emailCount: number;
    threadCount: number;
  };
  error?: string;
}

export interface GetEmailsResponse {
  emails: Email[];
  threads: Thread[];
  characters: Array<{
    id: CharacterId;
    name: string;
    role: string;
    email: string;
  }>;
  folders: Array<{
    type: FolderType;
    count: number;
    unreadCount: number;
  }>;
}
