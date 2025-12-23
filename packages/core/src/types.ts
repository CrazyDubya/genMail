/**
 * EmailVerse Core Types
 * 
 * These are the foundational types for the entire system.
 * Build on these, extend them, but maintain their spirit.
 */

// ============================================================================
// IDENTIFIERS
// ============================================================================

type CharacterId = string & { readonly brand: unique symbol };
type EmailId = string & { readonly brand: unique symbol };
type ThreadId = string & { readonly brand: unique symbol };
type DocumentId = string & { readonly brand: unique symbol };
type TensionId = string & { readonly brand: unique symbol };
type TaskId = string & { readonly brand: unique symbol };
type EventId = string & { readonly brand: unique symbol };

// ============================================================================
// MODEL CONFIGURATION
// ============================================================================

type ModelIdentifier = 
  | 'claude-opus'
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'gpt-5.2-nano'
  | 'gemini-3-flash'
  | 'grok-3-fast'
  | 'openrouter-cheap';

interface ModelConfig {
  anthropic: { apiKey: string };
  openai: { apiKey: string };
  google: { apiKey: string };
  xai: { apiKey: string };
  openrouter: { apiKey: string; defaultModel: string };
}

type CostTier = 'premium' | 'standard' | 'economy';

// ============================================================================
// DOCUMENTS
// ============================================================================

interface RawDocument {
  id: DocumentId;
  filename: string;
  mimeType: string;
  content: string;
  uploadedAt: Date;
}

interface ProcessedDocument {
  id: DocumentId;
  raw: RawDocument;
  chunks: DocumentChunk[];
  extractedEntities: ExtractedEntity[];
  themes: Theme[];
  processingMetadata: {
    chunkCount: number;
    tokenEstimate: number;
    processingTimeMs: number;
  };
}

interface DocumentChunk {
  id: string;
  documentId: DocumentId;
  content: string;
  startOffset: number;
  endOffset: number;
  tokenEstimate: number;
  embedding?: number[]; // Optional vector embedding
}

// ============================================================================
// EXTRACTION
// ============================================================================

interface ExtractedEntity {
  id: string;
  type: 'person' | 'organization' | 'concept' | 'event' | 'location';
  name: string;
  aliases: string[];
  mentions: EntityMention[];
  attributes: Record<string, unknown>;
  confidence: number;
}

interface EntityMention {
  chunkId: string;
  context: string; // surrounding text
  sentiment?: number; // -1 to 1
}

interface Theme {
  id: string;
  name: string;
  description: string;
  relevantChunks: string[];
  weight: number; // 0 to 1, importance
}

// ============================================================================
// CHARACTERS
// ============================================================================

interface Character {
  id: CharacterId;
  
  // Identity
  name: string;
  role: string;
  origin: 'intrinsic' | 'extrinsic';
  sourceEntityId?: string; // if intrinsic, which entity
  archetype?: CharacterArchetype; // if extrinsic
  
  // Voice binding (critical!)
  voiceBinding: VoiceBinding;
  
  // Psychology
  goals: Goal[];
  secrets: Secret[];
  beliefs: Belief[];
  emotionalState: EmotionalState;
  
  // Behavior patterns
  emailBehavior: EmailBehavior;
  
  // Knowledge bounds
  knows: Set<string>; // fact IDs
  believes: Map<string, number>; // fact ID -> confidence
  suspects: Set<string>; // things they suspect but don't know
}

type CharacterArchetype = 
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

interface VoiceBinding {
  modelId: ModelIdentifier;
  voiceProfile: VoiceProfile;
}

interface VoiceProfile {
  formality: number; // 0-1
  verbosity: number; // 0-1
  emojiUsage: number; // 0-1
  punctuationStyle: 'standard' | 'minimal' | 'expressive';
  vocabulary: string[]; // characteristic words/phrases
  greetingPatterns: string[];
  signoffPatterns: string[];
  quirks: string[]; // specific behaviors
  sampleOutputs: string[]; // few-shot examples
}

interface Goal {
  id: string;
  description: string;
  priority: 'immediate' | 'short-term' | 'long-term';
  relatedTensions?: TensionId[];
}

interface Secret {
  id: string;
  description: string;
  knownBy: CharacterId[]; // empty if truly secret
  wouldRevealTo?: CharacterId[]; // under what pressure
}

interface Belief {
  id: string;
  statement: string;
  strength: number; // 0-1, how strongly held
  couldConflictWith?: CharacterId[]; // who might disagree
}

interface EmotionalState {
  baseline: EmotionalBaseline;
  current: EmotionalCurrent;
  triggers: EmotionalTrigger[];
}

type EmotionalBaseline = 'optimistic' | 'neutral' | 'pessimistic' | 'anxious' | 'confident';

interface EmotionalCurrent {
  valence: number; // -1 to 1
  arousal: number; // 0 to 1
  dominantEmotion: string;
}

interface EmotionalTrigger {
  trigger: string;
  response: string;
}

interface EmailBehavior {
  frequency: 'prolific' | 'moderate' | 'sparse';
  responseLatency: 'immediate' | 'thoughtful' | 'delayed';
  typicalLength: 'brief' | 'moderate' | 'lengthy';
  threadParticipation: 'initiator' | 'responder' | 'lurker' | 'mixed';
}

// ============================================================================
// RELATIONSHIPS
// ============================================================================

interface Relationship {
  id: string;
  participants: [CharacterId, CharacterId];
  type: RelationshipType;
  strength: number; // 0-1
  sentiment: number; // -1 to 1
  history: RelationshipEvent[];
}

type RelationshipType = 
  | 'colleagues'
  | 'friends'
  | 'rivals'
  | 'mentor-mentee'
  | 'collaborators'
  | 'adversaries'
  | 'acquaintances'
  | 'strangers';

interface RelationshipEvent {
  eventId: EventId;
  impact: number; // how much it changed the relationship
  description: string;
}

// ============================================================================
// TENSIONS
// ============================================================================

interface Tension {
  id: TensionId;
  type: TensionType;
  participants: CharacterId[];
  description: string;
  intensity: number; // 0-1
  status: 'building' | 'active' | 'climax' | 'resolving' | 'resolved';
  relatedDocumentThemes: string[];
  createdAtTick: number;
  resolvedAtTick?: number;
}

type TensionType = 
  | 'conflict' // direct disagreement
  | 'secret' // someone knows something others don't
  | 'desire' // someone wants something
  | 'mystery' // something unexplained
  | 'alliance' // forming or breaking
  | 'competition' // vying for same thing
  | 'revelation' // truth coming to light
  | 'betrayal' // trust violation
  | 'opportunity' // chance for change;

// ============================================================================
// WORLD STATE
// ============================================================================

interface WorldState {
  id: string;
  createdAt: Date;
  lastTickAt: Date;
  tickCount: number;
  
  // Simulated time
  simulatedTimeStart: Date;
  simulatedTimeCurrent: Date;
  
  // Entities
  characters: Map<CharacterId, Character>;
  relationships: Relationship[];
  tensions: Tension[];
  
  // Knowledge graph
  facts: Map<string, Fact>;
  
  // Timeline
  events: SimulatedEvent[];
  
  // Generated content
  emails: Email[];
  
  // Source material
  documents: ProcessedDocument[];
  
  // Generation config
  config: WorldConfig;
}

interface WorldConfig {
  targetEmailCount: number;
  characterCount: { min: number; max: number };
  extrinsicArchetypes: CharacterArchetype[];
  tensionDensity: number; // 0-1
  spamRatio: number; // 0-1
  newsletterFrequency: number; // per simulated week
}

interface Fact {
  id: string;
  statement: string;
  source: 'document' | 'inferred' | 'simulated';
  confidence: number;
  relatedEntities: string[];
}

// ============================================================================
// SIMULATION
// ============================================================================

interface SimulatedEvent {
  id: EventId;
  tick: number;
  simulatedTime: Date;
  type: EventType;
  description: string;
  participants: CharacterId[];
  affectedTensions: TensionId[];
  generatedEmails: EmailId[];
}

type EventType = 
  | 'communication' // someone emails
  | 'discovery' // someone learns something
  | 'decision' // someone decides something
  | 'conflict' // tension escalates
  | 'resolution' // tension resolves
  | 'external' // newsletter publishes, spam campaign, etc;

interface TickConfig {
  minDuration: Duration;
  maxDuration: Duration;
  targetEventsPerTick: number;
}

interface Duration {
  value: number;
  unit: 'hours' | 'days' | 'weeks';
}

interface TickResult {
  tickNumber: number;
  simulatedTimeStart: Date;
  simulatedTimeEnd: Date;
  events: SimulatedEvent[];
  newEmails: Email[];
  worldStateChanges: WorldStateChange[];
  metrics: TickMetrics;
}

interface WorldStateChange {
  type: 'character_update' | 'tension_update' | 'relationship_update' | 'new_fact';
  entityId: string;
  before: unknown;
  after: unknown;
}

interface TickMetrics {
  eventsGenerated: number;
  emailsGenerated: number;
  tensionsResolved: number;
  tensionsCreated: number;
  modelCallsCount: Record<ModelIdentifier, number>;
  durationMs: number;
}

// ============================================================================
// EMAILS
// ============================================================================

interface Email {
  id: EmailId;
  threadId: ThreadId;
  
  // Headers
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  
  // Timing
  sentAt: Date; // simulated time
  generatedAt: Date; // real time
  
  // Content
  body: string;
  bodyFormat: 'plain' | 'html';
  
  // Metadata
  type: EmailType;
  isRead: boolean;
  isStarred: boolean;
  folder: FolderType;
  
  // Relationships
  inReplyTo?: EmailId;
  references: EmailId[];
  
  // Generation metadata
  generatedBy: {
    characterId: CharacterId;
    modelId: ModelIdentifier;
    eventId: EventId;
    tick: number;
  };
  
  // Corruption effects (for UI)
  corruption?: CorruptionEffect;
}

interface EmailAddress {
  characterId: CharacterId;
  displayName: string;
  address: string; // fake email address
}

type EmailType = 
  | 'thread_message'
  | 'standalone'
  | 'newsletter'
  | 'spam'
  | 'automated'
  | 'forward';

type FolderType = 
  | 'inbox'
  | 'sent'
  | 'spam'
  | 'newsletters'
  | 'flagged'
  | 'trash';

interface CorruptionEffect {
  type: 'redacted' | 'partial' | 'glitched' | 'fragmented';
  affectedRanges?: Array<{ start: number; end: number }>;
  severity: number; // 0-1
}

interface Thread {
  id: ThreadId;
  subject: string;
  participants: CharacterId[];
  emails: EmailId[]; // ordered
  startedAt: Date;
  lastActivityAt: Date;
  messageCount: number;
  isResolved: boolean;
  relatedTensions: TensionId[];
}

// ============================================================================
// TASKS
// ============================================================================

interface Task<T = unknown, R = unknown> {
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

type TaskStatus = 'pending' | 'blocked' | 'running' | 'complete' | 'failed';

type TaskType = 
  // Document processing
  | 'chunk_document'
  | 'extract_entities'
  | 'merge_extractions'
  | 'infer_relationships'
  | 'identify_themes'
  
  // Character creation
  | 'generate_character_psychology'
  | 'generate_voice_samples'
  | 'bind_character_model'
  
  // Simulation
  | 'plan_tick_events'
  | 'execute_event'
  | 'update_world_state'
  
  // Email generation
  | 'plan_email'
  | 'generate_email_content'
  | 'review_email'
  | 'assemble_thread'
  
  // Quality
  | 'coherence_check'
  | 'voice_consistency_check';

// ============================================================================
// AGENT TEAMS
// ============================================================================

interface AgentTeam {
  id: string;
  role: TeamRole;
  lead: AgentConfig;
  workers: AgentConfig[];
  activeTasks: TaskId[];
  completedTasks: number;
}

type TeamRole = 'research' | 'character' | 'content' | 'quality';

interface AgentConfig {
  id: string;
  modelId: ModelIdentifier;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  costTier: CostTier;
}

// ============================================================================
// API TYPES
// ============================================================================

interface CreateUniverseRequest {
  documents: File[];
  config?: Partial<WorldConfig>;
}

interface CreateUniverseResponse {
  universeId: string;
  status: 'processing';
  estimatedCompletionMs: number;
}

interface UniverseStatusResponse {
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

interface GetEmailsResponse {
  emails: Email[];
  threads: Thread[];
  characters: Array<{
    id: CharacterId;
    name: string;
    role: string;
    avatarUrl?: string;
  }>;
  folders: Array<{
    type: FolderType;
    count: number;
    unreadCount: number;
  }>;
}

interface ReplyRequest {
  emailId: EmailId;
  body: string;
}

interface ReplyResponse {
  userEmail: Email;
  responseEmail: Email;
}

interface GenerateMoreRequest {
  threadId: ThreadId;
  count?: number;
}

interface GenerateMoreResponse {
  newEmails: Email[];
}

interface AddDocumentsRequest {
  documents: File[];
}

interface AddDocumentsResponse {
  processingId: string;
  estimatedNewEmails: number;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type {
  // IDs
  CharacterId,
  EmailId,
  ThreadId,
  DocumentId,
  TensionId,
  TaskId,
  EventId,
  
  // Models
  ModelIdentifier,
  ModelConfig,
  CostTier,
  
  // Documents
  RawDocument,
  ProcessedDocument,
  DocumentChunk,
  ExtractedEntity,
  EntityMention,
  Theme,
  
  // Characters
  Character,
  CharacterArchetype,
  VoiceBinding,
  VoiceProfile,
  Goal,
  Secret,
  Belief,
  EmotionalState,
  EmailBehavior,
  
  // Relationships
  Relationship,
  RelationshipType,
  
  // Tensions
  Tension,
  TensionType,
  
  // World
  WorldState,
  WorldConfig,
  Fact,
  
  // Simulation
  SimulatedEvent,
  EventType,
  TickConfig,
  TickResult,
  Duration,
  
  // Emails
  Email,
  EmailAddress,
  EmailType,
  FolderType,
  Thread,
  CorruptionEffect,
  
  // Tasks
  Task,
  TaskType,
  TaskStatus,
  
  // Agents
  AgentTeam,
  TeamRole,
  AgentConfig,
  
  // API
  CreateUniverseRequest,
  CreateUniverseResponse,
  UniverseStatusResponse,
  GetEmailsResponse,
  ReplyRequest,
  ReplyResponse,
  GenerateMoreRequest,
  GenerateMoreResponse,
  AddDocumentsRequest,
  AddDocumentsResponse,
};
