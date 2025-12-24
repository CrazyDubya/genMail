/**
 * Character Generation Pipeline
 *
 * Generates deep characters from extracted entities and archetypes.
 *
 * NEW: Characters now receive actual document knowledge via the
 * generateCharacterKnowledge function, solving the empty knows[] problem.
 */

import { v4 as uuid } from 'uuid';
import type {
  Character,
  CharacterId,
  CharacterArchetype,
  VoiceProfile,
  EmotionalState,
  EmailBehavior,
  ExtractedEntity,
  Theme,
  ModelIdentifier,
  DocumentContext,
  ExtractedConcept,
  Author,
  AuthorRelationship,
} from '../types.js';
import type { ModelRouter } from '../models/router.js';
import { generateCharacterKnowledge } from './understanding.js';

// =============================================================================
// ARCHETYPE TEMPLATES
// =============================================================================

interface ArchetypeTemplate {
  archetype: CharacterArchetype;
  description: string;
  suggestedModel: ModelIdentifier;
  namePatterns: string[];
  rolePatterns: string[];
  typicalGoals: string[];
  typicalSecrets: string[];
  typicalBeliefs: string[];
  voiceHints: Partial<VoiceProfile>;
  emailBehavior: EmailBehavior;
  emotionalBaseline: EmotionalState['baseline'];
}

const ARCHETYPE_TEMPLATES: Record<CharacterArchetype, ArchetypeTemplate> = {
  protagonist: {
    archetype: 'protagonist',
    description: 'Central figure driving the narrative',
    suggestedModel: 'claude-haiku',
    namePatterns: ['Dr. {Name}', '{Name} {Surname}'],
    rolePatterns: ['Lead {Role}', 'Director', 'Founder'],
    typicalGoals: [
      'Advance the central project',
      'Convince others of their vision',
      'Protect what they built',
    ],
    typicalSecrets: [
      'Doubt about their approach',
      'Past failure never mentioned',
    ],
    typicalBeliefs: [
      'Their work matters more than most realize',
      'The right approach will win out',
    ],
    voiceHints: {
      formality: 0.6,
      verbosity: 0.5,
      quirks: ['Uses "we" instead of "I"'],
    },
    emailBehavior: {
      frequency: 'prolific',
      responseLatency: 'thoughtful',
      typicalLength: 'moderate',
      threadParticipation: 'initiator',
    },
    emotionalBaseline: 'confident',
  },
  antagonist: {
    archetype: 'antagonist',
    description: 'Opposes the protagonist, creates conflict',
    suggestedModel: 'gpt-4o-mini',
    namePatterns: ['{Name} {Surname}', '{Title} {Surname}'],
    rolePatterns: ['VP of {Department}', 'Senior {Role}'],
    typicalGoals: [
      'Block the protagonist plans',
      'Advance competing agenda',
      'Protect their position',
    ],
    typicalSecrets: [
      'Actually agree on some things',
      'Personal reasons beyond stated objections',
    ],
    typicalBeliefs: [
      'The protagonist is wrong',
      'Someone needs to be cautious',
    ],
    voiceHints: {
      formality: 0.7,
      verbosity: 0.6,
      quirks: ['Questions as concerns', 'CCs others strategically'],
    },
    emailBehavior: {
      frequency: 'moderate',
      responseLatency: 'thoughtful',
      typicalLength: 'lengthy',
      threadParticipation: 'responder',
    },
    emotionalBaseline: 'neutral',
  },
  skeptic: {
    archetype: 'skeptic',
    description: 'Questions everything, demands evidence',
    suggestedModel: 'grok-fast',
    namePatterns: ['{Name}', '{Name} {Surname}'],
    rolePatterns: ['Analyst', 'Reviewer', 'Consultant'],
    typicalGoals: ['Find holes in arguments', 'Maintain intellectual integrity'],
    typicalSecrets: ['Sometimes skepticism is defense', 'Hopes to be convinced'],
    typicalBeliefs: ['Most claims don\'t hold up', 'Asking hard questions helps'],
    voiceHints: {
      formality: 0.5,
      verbosity: 0.7,
      quirks: ['Lots of questions', '"But have you considered..."'],
    },
    emailBehavior: {
      frequency: 'moderate',
      responseLatency: 'immediate',
      typicalLength: 'lengthy',
      threadParticipation: 'responder',
    },
    emotionalBaseline: 'neutral',
  },
  enthusiast: {
    archetype: 'enthusiast',
    description: 'Over-eager supporter, amplifies everything',
    suggestedModel: 'gpt-4o-mini',
    namePatterns: ['{Name}', '{Nickname}'],
    rolePatterns: ['Community Manager', 'Evangelist', 'Early Adopter'],
    typicalGoals: ['Spread the word', 'Be part of something bigger'],
    typicalSecrets: ['Don\'t fully understand details', 'Doubt if hype is justified'],
    typicalBeliefs: ['This will change everything', 'Critics don\'t get it'],
    voiceHints: {
      formality: 0.2,
      verbosity: 0.8,
      emojiUsage: 0.6,
      quirks: ['Exclamation points!', 'Uses superlatives'],
    },
    emailBehavior: {
      frequency: 'prolific',
      responseLatency: 'immediate',
      typicalLength: 'moderate',
      threadParticipation: 'initiator',
    },
    emotionalBaseline: 'optimistic',
  },
  expert: {
    archetype: 'expert',
    description: 'Deep domain knowledge, respected authority',
    suggestedModel: 'gemini-flash',
    namePatterns: ['Dr. {Name} {Surname}', 'Prof. {Surname}'],
    rolePatterns: ['Professor', 'Senior Researcher', 'Fellow'],
    typicalGoals: ['Advance understanding', 'Correct misconceptions'],
    typicalSecrets: ['Field changing faster than can keep up', 'Past work hasn\'t aged well'],
    typicalBeliefs: ['Expertise should be respected', 'Nuance matters'],
    voiceHints: {
      formality: 0.7,
      verbosity: 0.6,
      quirks: ['Cites sources', 'Uses precise terminology'],
    },
    emailBehavior: {
      frequency: 'sparse',
      responseLatency: 'delayed',
      typicalLength: 'lengthy',
      threadParticipation: 'responder',
    },
    emotionalBaseline: 'neutral',
  },
  newcomer: {
    archetype: 'newcomer',
    description: 'New to domain, asks basic questions',
    suggestedModel: 'gpt-4o-mini',
    namePatterns: ['{Name}', '{Name} {Surname}'],
    rolePatterns: ['New Team Member', 'Intern', 'Junior {Role}'],
    typicalGoals: ['Understand what\'s going on', 'Prove themselves'],
    typicalSecrets: ['More confused than they show', 'Have ideas but afraid to share'],
    typicalBeliefs: ['Probably good reason for how things are', 'Fresh perspective valuable'],
    voiceHints: {
      formality: 0.5,
      verbosity: 0.4,
      quirks: ['Apologizes before asking', 'Thanks people a lot'],
    },
    emailBehavior: {
      frequency: 'moderate',
      responseLatency: 'immediate',
      typicalLength: 'brief',
      threadParticipation: 'responder',
    },
    emotionalBaseline: 'anxious',
  },
  newsletter_curator: {
    archetype: 'newsletter_curator',
    description: 'Aggregates and distributes via newsletters',
    suggestedModel: 'gemini-flash',
    namePatterns: ['{Newsletter} Team', 'The {Topic} Digest'],
    rolePatterns: ['Editor', 'Curator', 'Publisher'],
    typicalGoals: ['Grow readership', 'Be the go-to source'],
    typicalSecrets: ['Not as well-sourced as appears', 'Sometimes fills with fluff'],
    typicalBeliefs: ['Curation is valuable', 'Regular cadence builds trust'],
    voiceHints: {
      formality: 0.5,
      verbosity: 0.7,
      emojiUsage: 0.3,
      greetingPatterns: ['This week in {Topic}:', 'Happy {Day}!'],
      signoffPatterns: ['Until next time,', 'Stay curious,'],
      quirks: ['Section headers', 'Numbered lists'],
    },
    emailBehavior: {
      frequency: 'moderate',
      responseLatency: 'delayed',
      typicalLength: 'lengthy',
      threadParticipation: 'initiator',
    },
    emotionalBaseline: 'optimistic',
  },
  spammer: {
    archetype: 'spammer',
    description: 'Sends unsolicited promotional content',
    suggestedModel: 'openrouter-cheap',
    namePatterns: ['{Random} Team', 'Support', '{Company} Sales'],
    rolePatterns: ['Sales', 'Business Development'],
    typicalGoals: ['Get clicks', 'Appear legitimate'],
    typicalSecrets: [],
    typicalBeliefs: [],
    voiceHints: {
      formality: 0.4,
      verbosity: 0.5,
      emojiUsage: 0.4,
      quirks: ['URGENCY', 'Too-good-to-be-true offers', 'Slight misspellings'],
    },
    emailBehavior: {
      frequency: 'prolific',
      responseLatency: 'immediate',
      typicalLength: 'brief',
      threadParticipation: 'initiator',
    },
    emotionalBaseline: 'optimistic',
  },
  insider: {
    archetype: 'insider',
    description: 'Has access to information others don\'t',
    suggestedModel: 'claude-haiku',
    namePatterns: ['{Name}', 'Anonymous', '{Nickname}'],
    rolePatterns: ['Source', 'Former {Role}', 'Concerned Employee'],
    typicalGoals: ['Get the truth out', 'Protect themselves'],
    typicalSecrets: ['Their true identity', 'What they\'re holding back'],
    typicalBeliefs: ['People deserve to know', 'The risks are worth it'],
    voiceHints: {
      formality: 0.4,
      verbosity: 0.3,
      quirks: ['Vague about identity', 'Hints at more'],
    },
    emailBehavior: {
      frequency: 'sparse',
      responseLatency: 'delayed',
      typicalLength: 'brief',
      threadParticipation: 'initiator',
    },
    emotionalBaseline: 'anxious',
  },
  outsider: {
    archetype: 'outsider',
    description: 'External observer with different perspective',
    suggestedModel: 'grok-fast',
    namePatterns: ['{Name} {Surname}', '{Name}'],
    rolePatterns: ['Journalist', 'Blogger', 'Industry Observer'],
    typicalGoals: ['Understand what\'s happening', 'Get a story'],
    typicalSecrets: ['Have an agenda', 'Know more than they let on'],
    typicalBeliefs: ['Outsiders see things insiders miss', 'Good questions matter'],
    voiceHints: {
      formality: 0.4,
      verbosity: 0.5,
      quirks: ['Probing questions', 'References other examples'],
    },
    emailBehavior: {
      frequency: 'moderate',
      responseLatency: 'thoughtful',
      typicalLength: 'moderate',
      threadParticipation: 'mixed',
    },
    emotionalBaseline: 'neutral',
  },
};

// =============================================================================
// NAME GENERATION
// =============================================================================

const FIRST_NAMES = [
  'Alex', 'Jordan', 'Morgan', 'Taylor', 'Casey', 'Riley', 'Quinn', 'Avery',
  'Reese', 'Skylar', 'Dakota', 'Emerson', 'Finley', 'Hayden', 'Kendall',
  'Sarah', 'Michael', 'Emily', 'James', 'Emma', 'David', 'Olivia', 'Daniel',
  'Sophia', 'Matthew', 'Isabella', 'Andrew', 'Mia', 'Joshua', 'Charlotte',
];

const LAST_NAMES = [
  'Chen', 'Patel', 'Kim', 'Nguyen', 'Garcia', 'Martinez', 'Rodriguez', 'Lee',
  'Wilson', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin',
  'Thompson', 'Moore', 'Taylor', 'Brown', 'Davis', 'Miller', 'Johnson',
];

function generateName(): { first: string; last: string } {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return { first, last };
}

function generateEmail(name: string): string {
  const sanitized = name.toLowerCase().replace(/[^a-z0-9]/g, '.');
  const domains = ['company.com', 'corp.io', 'work.net', 'team.org', 'office.co'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  return `${sanitized}@${domain}`;
}

// =============================================================================
// CHARACTER GENERATION
// =============================================================================

/**
 * Generate an intrinsic character from an extracted entity.
 *
 * NEW: Now accepts DocumentContext and concepts to populate knows[].
 */
export async function generateIntrinsicCharacter(
  entity: ExtractedEntity,
  themes: Theme[],
  router: ModelRouter,
  context?: DocumentContext,
  concepts?: ExtractedConcept[]
): Promise<Character> {
  const id = uuid() as CharacterId;

  // Use Claude for deep character generation
  const prompt = `Create a deep character profile based on this entity:

Entity: ${entity.name}
Type: ${entity.type}
Attributes: ${JSON.stringify(entity.attributes)}

Related themes in the source material:
${themes.slice(0, 3).map((t) => `- ${t.name}: ${t.description}`).join('\n')}

Generate a character with:
1. A role/title that fits their entity type
2. 2-3 specific goals (immediate, short-term, long-term)
3. 1-2 secrets they're keeping
4. 2-3 beliefs they hold strongly
5. A voice profile with distinct patterns

Respond with JSON:
{
  "role": "string",
  "goals": [{"description": "string", "priority": "immediate|short-term|long-term"}],
  "secrets": [{"description": "string"}],
  "beliefs": [{"statement": "string", "strength": 0.0-1.0}],
  "voiceProfile": {
    "formality": 0.0-1.0,
    "verbosity": 0.0-1.0,
    "vocabulary": ["string"],
    "greetingPatterns": ["string"],
    "signoffPatterns": ["string"],
    "quirks": ["string"]
  },
  "emotionalBaseline": "optimistic|neutral|pessimistic|anxious|confident"
}`;

  try {
    const result = await router.generateStructured<{
      role: string;
      goals: Array<{ description: string; priority: 'immediate' | 'short-term' | 'long-term' }>;
      secrets: Array<{ description: string }>;
      beliefs: Array<{ statement: string; strength: number }>;
      voiceProfile: Partial<VoiceProfile>;
      emotionalBaseline: EmotionalState['baseline'];
    }>('claude-sonnet', prompt, { temperature: 0.7 });

    const voiceProfile: VoiceProfile = {
      formality: result.voiceProfile.formality ?? 0.5,
      verbosity: result.voiceProfile.verbosity ?? 0.5,
      emojiUsage: result.voiceProfile.emojiUsage ?? 0.1,
      punctuationStyle: 'standard',
      vocabulary: result.voiceProfile.vocabulary ?? [],
      greetingPatterns: result.voiceProfile.greetingPatterns ?? ['Hi', 'Hello'],
      signoffPatterns: result.voiceProfile.signoffPatterns ?? ['Best', 'Thanks'],
      quirks: result.voiceProfile.quirks ?? [],
      sampleOutputs: [],
    };

    // Generate voice samples
    const samples = await generateVoiceSamples(voiceProfile, router, 'claude-haiku');
    voiceProfile.sampleOutputs = samples;

    const character: Character = {
      id,
      name: entity.name,
      email: generateEmail(entity.name),
      role: result.role,
      origin: 'intrinsic',
      sourceEntityId: entity.id,
      voiceBinding: {
        modelId: 'claude-haiku',
        voiceProfile,
      },
      goals: result.goals.map((g) => ({
        id: uuid(),
        description: g.description,
        priority: g.priority,
      })),
      secrets: result.secrets.map((s) => ({
        id: uuid(),
        description: s.description,
        knownBy: [],
      })),
      beliefs: result.beliefs.map((b) => ({
        id: uuid(),
        statement: b.statement,
        strength: b.strength,
      })),
      emotionalState: {
        baseline: result.emotionalBaseline,
        current: {
          valence: 0,
          arousal: 0.5,
          dominantEmotion: 'neutral',
        },
      },
      emailBehavior: {
        frequency: 'moderate',
        responseLatency: 'thoughtful',
        typicalLength: 'moderate',
        threadParticipation: 'mixed',
      },
      // NEW: Populate knows[] with actual document knowledge
      // Use context even if concepts is empty - characters should know thesis/claims
      knows: context
        ? generateCharacterKnowledge('protagonist', context, concepts ?? [])
        : [],
      suspects: [],
    };

    // Bind to model
    router.bindCharacter(id, character.voiceBinding.modelId, voiceProfile);

    console.log(`[Character Generation] Created intrinsic character "${character.name}" with ${character.knows.length} knowledge items`);
    return character;
  } catch (error) {
    console.error('Character generation failed:', error);
    // Return basic character on failure - but ensure it's bound to the router
    const basicChar = createBasicCharacter(entity.name, 'unknown', context, concepts);
    router.bindCharacter(basicChar.id, basicChar.voiceBinding.modelId, basicChar.voiceBinding.voiceProfile);
    return basicChar;
  }
}

/**
 * Generate an extrinsic character from an archetype.
 *
 * NEW: Now accepts DocumentContext and concepts to populate knows[].
 */
export async function generateExtrinsicCharacter(
  archetype: CharacterArchetype,
  themes: Theme[],
  router: ModelRouter,
  context?: DocumentContext,
  concepts?: ExtractedConcept[]
): Promise<Character> {
  const template = ARCHETYPE_TEMPLATES[archetype];
  const id = uuid() as CharacterId;
  const { first, last } = generateName();
  const name = `${first} ${last}`;

  // Customize from template
  const prompt = `Create a character based on this archetype and themes:

Archetype: ${template.archetype} - ${template.description}

Related themes:
${themes.slice(0, 3).map((t) => `- ${t.name}: ${t.description}`).join('\n')}

Base goals to customize:
${template.typicalGoals.map((g) => `- ${g}`).join('\n')}

Generate specific goals, secrets, and beliefs for a character named "${name}".

Respond with JSON:
{
  "role": "string",
  "goals": [{"description": "string", "priority": "immediate|short-term|long-term"}],
  "secrets": [{"description": "string"}],
  "beliefs": [{"statement": "string", "strength": 0.0-1.0}]
}`;

  try {
    const result = await router.generateStructured<{
      role: string;
      goals: Array<{ description: string; priority: 'immediate' | 'short-term' | 'long-term' }>;
      secrets: Array<{ description: string }>;
      beliefs: Array<{ statement: string; strength: number }>;
    }>('gemini-flash', prompt, { temperature: 0.7 });

    const voiceProfile: VoiceProfile = {
      formality: template.voiceHints.formality ?? 0.5,
      verbosity: template.voiceHints.verbosity ?? 0.5,
      emojiUsage: template.voiceHints.emojiUsage ?? 0.1,
      punctuationStyle: 'standard',
      vocabulary: template.voiceHints.vocabulary ?? [],
      greetingPatterns: template.voiceHints.greetingPatterns ?? ['Hi', 'Hello'],
      signoffPatterns: template.voiceHints.signoffPatterns ?? ['Best', 'Thanks'],
      quirks: template.voiceHints.quirks ?? [],
      sampleOutputs: [],
    };

    // Generate voice samples
    const samples = await generateVoiceSamples(voiceProfile, router, template.suggestedModel);
    voiceProfile.sampleOutputs = samples;

    const character: Character = {
      id,
      name,
      email: generateEmail(name),
      role: result.role,
      origin: 'extrinsic',
      archetype,
      voiceBinding: {
        modelId: template.suggestedModel,
        voiceProfile,
      },
      goals: result.goals.map((g) => ({
        id: uuid(),
        description: g.description,
        priority: g.priority,
      })),
      secrets: result.secrets.map((s) => ({
        id: uuid(),
        description: s.description,
        knownBy: [],
      })),
      beliefs: result.beliefs.map((b) => ({
        id: uuid(),
        statement: b.statement,
        strength: b.strength,
      })),
      emotionalState: {
        baseline: template.emotionalBaseline,
        current: {
          valence: 0,
          arousal: 0.5,
          dominantEmotion: 'neutral',
        },
      },
      emailBehavior: template.emailBehavior,
      // NEW: Populate knows[] with archetype-specific document knowledge
      // Use context even if concepts is empty - characters should know thesis/claims
      knows: context
        ? generateCharacterKnowledge(archetype, context, concepts ?? [])
        : [],
      suspects: [],
    };

    // Bind to model
    router.bindCharacter(id, character.voiceBinding.modelId, voiceProfile);

    console.log(`[Character Generation] Created extrinsic character "${character.name}" (${archetype}) with ${character.knows.length} knowledge items`);
    return character;
  } catch (error) {
    console.error('Extrinsic character generation failed:', error);
    // Return basic character on failure - but ensure it's bound to the router
    const basicChar = createBasicCharacter(name, archetype, context, concepts);
    router.bindCharacter(basicChar.id, basicChar.voiceBinding.modelId, basicChar.voiceBinding.voiceProfile);
    return basicChar;
  }
}

/**
 * Generate voice samples for a character.
 */
async function generateVoiceSamples(
  voiceProfile: VoiceProfile,
  router: ModelRouter,
  modelId: ModelIdentifier
): Promise<string[]> {
  const scenarios = [
    'Write a brief email announcing a meeting next week.',
    'Write a follow-up email thanking someone for their help.',
    'Write an email expressing concern about a deadline.',
  ];

  const samples: string[] = [];

  for (const scenario of scenarios) {
    const prompt = `Write a short email (2-4 sentences) for this scenario: ${scenario}

Voice guidelines:
- Formality: ${voiceProfile.formality}/1
- Verbosity: ${voiceProfile.verbosity}/1
- Quirks: ${voiceProfile.quirks.join(', ')}

Write ONLY the email body, no subject or headers.`;

    try {
      const sample = await router.generate(modelId, prompt, {
        temperature: 0.7,
        maxTokens: 256,
      });
      samples.push(sample.trim());
    } catch (error) {
      console.error('Voice sample generation failed:', error);
    }
  }

  return samples;
}

// =============================================================================
// AUTHOR-BASED CHARACTER GENERATION
// =============================================================================

/**
 * Generate characters from extracted document authors.
 * Uses author contributions and positions to assign appropriate archetypes.
 *
 * This is particularly useful for academic papers where authors have
 * documented contributions that map well to character roles.
 */
export async function generateCharactersFromAuthors(
  authors: Author[],
  authorRelationships: AuthorRelationship[],
  themes: Theme[],
  router: ModelRouter,
  context?: DocumentContext,
  concepts?: ExtractedConcept[]
): Promise<Character[]> {
  if (authors.length === 0) {
    return [];
  }

  console.log(`[Character Generation] Generating characters from ${authors.length} authors`);

  const characters: Character[] = [];

  // Generate characters for each author in parallel
  const results = await Promise.allSettled(
    authors.map((author) =>
      generateCharacterFromAuthor(author, themes, router, context, concepts)
    )
  );

  // Collect successful characters
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      characters.push(result.value);
    } else {
      console.warn(
        `[Character Generation] Failed to generate character for author ${authors[i].name}:`,
        result.reason
      );
    }
  }

  // Store author relationships for later use in tension initialization
  // (relationships are used to inform initial character dynamics)
  for (const char of characters) {
    const author = authors.find((a) => a.name === char.name);
    if (author) {
      // Find relationships involving this author
      const relatedRelationships = authorRelationships.filter(
        (r) => r.author1Id === author.id || r.author2Id === author.id
      );

      // Add relationship info to character's suspects (loose coupling)
      for (const rel of relatedRelationships) {
        const otherAuthorId =
          rel.author1Id === author.id ? rel.author2Id : rel.author1Id;
        const otherAuthor = authors.find((a) => a.id === otherAuthorId);
        if (otherAuthor) {
          char.suspects.push(
            `${rel.relationshipType} with ${otherAuthor.name}: ${rel.description}`
          );
        }
      }
    }
  }

  console.log(
    `[Character Generation] Created ${characters.length} author-based characters`
  );

  return characters;
}

/**
 * Generate a single character from an author.
 */
async function generateCharacterFromAuthor(
  author: Author,
  themes: Theme[],
  router: ModelRouter,
  context?: DocumentContext,
  concepts?: ExtractedConcept[]
): Promise<Character> {
  const id = uuid() as CharacterId;
  const archetype = author.suggestedArchetype || inferArchetypeFromAuthor(author);
  const template = ARCHETYPE_TEMPLATES[archetype];

  // Build a rich prompt using author's contribution
  const prompt = `Create a character profile for a document author:

Name: ${author.name}
${author.affiliation ? `Affiliation: ${author.affiliation}` : ''}
${author.contribution ? `Contribution: "${author.contribution}"` : ''}
Author Position: ${author.authorPosition} of ${author.isCorresponding ? '(corresponding author)' : ''}
${author.equalContribution ? 'Equal contribution noted' : ''}

Archetype: ${archetype} - ${template.description}

Related themes:
${themes.slice(0, 3).map((t) => `- ${t.name}: ${t.description}`).join('\n')}

Generate specific goals, secrets, and beliefs based on their documented contribution.

Respond with JSON:
{
  "role": "string (based on their contribution)",
  "goals": [{"description": "string", "priority": "immediate|short-term|long-term"}],
  "secrets": [{"description": "string"}],
  "beliefs": [{"statement": "string", "strength": 0.0-1.0}],
  "voiceProfile": {
    "formality": 0.0-1.0,
    "verbosity": 0.0-1.0,
    "vocabulary": ["technical terms they would use"],
    "quirks": ["speech patterns based on their contribution"]
  }
}`;

  try {
    const result = await router.generateStructured<{
      role: string;
      goals: Array<{ description: string; priority: 'immediate' | 'short-term' | 'long-term' }>;
      secrets: Array<{ description: string }>;
      beliefs: Array<{ statement: string; strength: number }>;
      voiceProfile: Partial<VoiceProfile>;
    }>('claude-sonnet', prompt, { temperature: 0.7 });

    const voiceProfile: VoiceProfile = {
      formality: result.voiceProfile.formality ?? template.voiceHints.formality ?? 0.6,
      verbosity: result.voiceProfile.verbosity ?? template.voiceHints.verbosity ?? 0.5,
      emojiUsage: template.voiceHints.emojiUsage ?? 0.1,
      punctuationStyle: 'standard',
      vocabulary: result.voiceProfile.vocabulary ?? [],
      greetingPatterns: template.voiceHints.greetingPatterns ?? ['Hi', 'Hello'],
      signoffPatterns: template.voiceHints.signoffPatterns ?? ['Best', 'Regards'],
      quirks: result.voiceProfile.quirks ?? template.voiceHints.quirks ?? [],
      sampleOutputs: [],
    };

    // Generate voice samples
    const samples = await generateVoiceSamples(voiceProfile, router, template.suggestedModel);
    voiceProfile.sampleOutputs = samples;

    const character: Character = {
      id,
      name: author.name,
      email: generateAuthorEmail(author),
      role: result.role,
      origin: 'intrinsic',
      archetype,
      sourceEntityId: author.id,
      voiceBinding: {
        modelId: template.suggestedModel,
        voiceProfile,
      },
      goals: result.goals.map((g) => ({
        id: uuid(),
        description: g.description,
        priority: g.priority,
      })),
      secrets: result.secrets.map((s) => ({
        id: uuid(),
        description: s.description,
        knownBy: [],
      })),
      beliefs: result.beliefs.map((b) => ({
        id: uuid(),
        statement: b.statement,
        strength: b.strength,
      })),
      emotionalState: {
        baseline: template.emotionalBaseline,
        current: {
          valence: 0,
          arousal: 0.5,
          dominantEmotion: 'neutral',
        },
      },
      emailBehavior: template.emailBehavior,
      knows:
        context && concepts
          ? generateCharacterKnowledge(archetype, context, concepts)
          : [],
      suspects: [],
    };

    // Bind to model
    router.bindCharacter(id, character.voiceBinding.modelId, voiceProfile);

    console.log(
      `[Character Generation] Created author character "${character.name}" (${archetype}) with ${character.knows.length} knowledge items`
    );

    return character;
  } catch (error) {
    console.error(`Author character generation failed for ${author.name}:`, error);
    // Return basic character on failure
    const basicChar = createBasicCharacter(author.name, archetype, context, concepts);
    router.bindCharacter(
      basicChar.id,
      basicChar.voiceBinding.modelId,
      basicChar.voiceBinding.voiceProfile
    );
    return basicChar;
  }
}

/**
 * Infer archetype from author position and contribution.
 */
function inferArchetypeFromAuthor(author: Author): CharacterArchetype {
  const contribution = (author.contribution || '').toLowerCase();

  // First author or "led" → protagonist
  if (author.authorPosition === 1 || contribution.includes('led') || contribution.includes('started')) {
    return 'protagonist';
  }

  // Last author (often senior/mentor) → expert
  if (author.authorPosition >= 5 || contribution.includes('supervised') || contribution.includes('advised')) {
    return 'expert';
  }

  // Design/architecture → expert
  if (contribution.includes('designed') || contribution.includes('proposed') || contribution.includes('conceived')) {
    return 'expert';
  }

  // Implementation → insider (knows the codebase)
  if (contribution.includes('implemented') || contribution.includes('codebase') || contribution.includes('engineering')) {
    return 'insider';
  }

  // Experiments/tuning → enthusiast
  if (contribution.includes('experiments') || contribution.includes('tuned') || contribution.includes('variants')) {
    return 'enthusiast';
  }

  // Default for junior authors
  if (author.authorPosition <= 2) {
    return 'newcomer';
  }

  return 'expert'; // Default
}

/**
 * Generate email address from author information.
 */
function generateAuthorEmail(author: Author): string {
  const nameParts = author.name.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);

  // Try first.last format
  const first = nameParts[0] || 'author';
  const last = nameParts[nameParts.length - 1] || 'unknown';

  // Infer domain from affiliation
  let domain = 'research.org';
  if (author.affiliation) {
    const aff = author.affiliation.toLowerCase();
    if (aff.includes('google')) domain = 'google.com';
    else if (aff.includes('brain')) domain = 'google.com';
    else if (aff.includes('openai')) domain = 'openai.com';
    else if (aff.includes('meta') || aff.includes('facebook')) domain = 'meta.com';
    else if (aff.includes('microsoft')) domain = 'microsoft.com';
    else if (aff.includes('university')) {
      const uniMatch = aff.match(/university of (\w+)/);
      if (uniMatch) domain = `${uniMatch[1]}.edu`;
      else domain = 'university.edu';
    }
    else if (aff.includes('mit')) domain = 'mit.edu';
    else if (aff.includes('stanford')) domain = 'stanford.edu';
    else if (aff.includes('berkeley')) domain = 'berkeley.edu';
  }

  return `${first}.${last}@${domain}`;
}

/**
 * Create a basic character as fallback.
 *
 * NEW: Now accepts context and concepts to populate knows[].
 */
function createBasicCharacter(
  name: string,
  archetype: string,
  context?: DocumentContext,
  concepts?: ExtractedConcept[]
): Character {
  const id = uuid() as CharacterId;

  const voiceProfile: VoiceProfile = {
    formality: 0.5,
    verbosity: 0.5,
    emojiUsage: 0.1,
    punctuationStyle: 'standard',
    vocabulary: [],
    greetingPatterns: ['Hi', 'Hello'],
    signoffPatterns: ['Best', 'Thanks'],
    quirks: [],
    sampleOutputs: [],
  };

  return {
    id,
    name,
    email: generateEmail(name),
    role: 'Team Member',
    origin: 'extrinsic',
    archetype: archetype as CharacterArchetype,
    voiceBinding: {
      modelId: 'gpt-4o-mini',
      voiceProfile,
    },
    goals: [{ id: uuid(), description: 'Contribute to the team', priority: 'long-term' }],
    secrets: [],
    beliefs: [],
    emotionalState: {
      baseline: 'neutral',
      current: { valence: 0, arousal: 0.5, dominantEmotion: 'neutral' },
    },
    emailBehavior: {
      frequency: 'moderate',
      responseLatency: 'thoughtful',
      typicalLength: 'moderate',
      threadParticipation: 'mixed',
    },
    // NEW: Even fallback characters get document knowledge
    // Use context even if concepts is empty
    knows: context
      ? generateCharacterKnowledge(archetype || 'newcomer', context, concepts ?? [])
      : [],
    suspects: [],
  };
}

// =============================================================================
// FULL CHARACTER GENERATION PIPELINE
// =============================================================================

/**
 * Generate all characters for a universe.
 * Uses parallel processing for faster generation while handling partial failures gracefully.
 *
 * NEW: Now accepts DocumentContext and concepts to populate character knowledge.
 */
export async function generateCharacters(
  entities: ExtractedEntity[],
  themes: Theme[],
  config: { min: number; max: number; archetypes: CharacterArchetype[] },
  router: ModelRouter,
  context?: DocumentContext,
  concepts?: ExtractedConcept[]
): Promise<Character[]> {
  console.log(`[Character Generation] Starting with ${entities.length} entities, ${themes.length} themes`);
  if (context) {
    console.log(`[Character Generation] Document context available: "${context.thesis.slice(0, 50)}..."`);
  }

  const characters: Character[] = [];

  // Priority 1: Generate characters from document authors (if available)
  // This takes precedence for academic papers with documented contributions
  if (context?.authors && context.authors.length > 0) {
    console.log(`[Character Generation] Prioritizing ${context.authors.length} authors for character generation`);
    const authorCharacters = await generateCharactersFromAuthors(
      context.authors,
      context.authorRelationships ?? [],
      themes,
      router,
      context,
      concepts
    );
    characters.push(...authorCharacters.slice(0, Math.floor(config.max / 2)));
  }

  // Priority 2: Generate intrinsic characters from person entities (in parallel)
  // Skip if we already have enough from authors
  const remainingForIntrinsic = Math.floor(config.max / 2) - characters.length;
  if (remainingForIntrinsic > 0) {
    const personEntities = entities
      .filter((e) => e.type === 'person')
      // Exclude entities that match author names (avoid duplicates)
      .filter((e) => !characters.some((c) => c.name.toLowerCase() === e.name.toLowerCase()))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, remainingForIntrinsic);

    const intrinsicResults = await Promise.allSettled(
      personEntities.map((entity) =>
        generateIntrinsicCharacter(entity, themes, router, context, concepts)
      )
    );

    for (let i = 0; i < intrinsicResults.length; i++) {
      const result = intrinsicResults[i];
      if (result.status === 'fulfilled') {
        characters.push(result.value);
      } else {
        console.warn(`[Character Generation] Failed to generate intrinsic character for ${personEntities[i].name}:`, result.reason);
      }
    }
  }

  // Generate extrinsic characters from archetypes (in parallel)
  const targetCount = Math.max(
    config.min,
    Math.min(config.max, characters.length + config.archetypes.length)
  );
  const neededExtrinsic = Math.max(0, targetCount - characters.length);

  // Prioritize archetypes
  const archetypesToUse = [
    ...config.archetypes,
    'newsletter_curator',
    'spammer',
    'skeptic',
    'enthusiast',
  ].slice(0, neededExtrinsic) as CharacterArchetype[];

  const extrinsicResults = await Promise.allSettled(
    archetypesToUse.map((archetype) =>
      generateExtrinsicCharacter(archetype, themes, router, context, concepts)
    )
  );

  // Collect successful extrinsic characters
  for (let i = 0; i < extrinsicResults.length; i++) {
    const result = extrinsicResults[i];
    if (result.status === 'fulfilled') {
      characters.push(result.value);
    } else {
      console.warn(`[Character Generation] Failed to generate extrinsic character for archetype ${archetypesToUse[i]}:`, result.reason);
    }
  }

  const totalKnowledge = characters.reduce((sum, c) => sum + c.knows.length, 0);
  console.log(`[Character Generation] Created ${characters.length} characters with ${totalKnowledge} total knowledge items`);

  return characters.slice(0, config.max);
}
