/**
 * Character Archetypes
 * 
 * Extrinsic characters are generated to fill ecosystem roles.
 * These archetypes define their core patterns.
 */

import type { CharacterArchetype, VoiceProfile, EmailBehavior, EmotionalState } from '@emailverse/core';

export interface ArchetypeTemplate {
  archetype: CharacterArchetype;
  description: string;
  purpose: string;
  suggestedModel: string;
  
  // Generation hints
  namePatterns: string[];
  rolePatterns: string[];
  
  // Personality
  typicalGoals: string[];
  typicalSecrets: string[];
  typicalBeliefs: string[];
  
  // Voice
  voiceHints: Partial<VoiceProfile>;
  emailBehavior: EmailBehavior;
  emotionalBaseline: EmotionalState['baseline'];
  
  // Relationship patterns
  attractedTo: CharacterArchetype[];
  repelledBy: CharacterArchetype[];
}

export const ARCHETYPE_TEMPLATES: Record<CharacterArchetype, ArchetypeTemplate> = {
  
  // ===========================================================================
  // PRIMARY ARCHETYPES (document-connected)
  // ===========================================================================
  
  protagonist: {
    archetype: 'protagonist',
    description: 'The central figure driving the narrative forward',
    purpose: 'Anchor the story, initiate key threads, embody document themes',
    suggestedModel: 'claude-haiku',
    
    namePatterns: ['Dr. {Name}', '{Name} {Surname}', '{Initial}. {Surname}'],
    rolePatterns: ['Lead {Role}', 'Director of {Department}', 'Founder'],
    
    typicalGoals: [
      'Advance the central project/mission',
      'Convince others of their vision',
      'Protect something they\'ve built',
      'Uncover the truth about something',
    ],
    typicalSecrets: [
      'Doubt about their own approach',
      'Past failure they\'ve never mentioned',
      'Knowledge of a problem they haven\'t shared',
    ],
    typicalBeliefs: [
      'Their work matters more than most realize',
      'The right approach will eventually win out',
      'Some things are worth personal sacrifice',
    ],
    
    voiceHints: {
      formality: 0.6,
      verbosity: 0.5,
      quirks: ['References document themes frequently', 'Uses "we" instead of "I"'],
    },
    emailBehavior: {
      frequency: 'prolific',
      responseLatency: 'thoughtful',
      typicalLength: 'moderate',
      threadParticipation: 'initiator',
    },
    emotionalBaseline: 'confident',
    
    attractedTo: ['collaborators', 'expert', 'insider'],
    repelledBy: ['antagonist', 'skeptic'],
  },

  antagonist: {
    archetype: 'antagonist',
    description: 'Opposes the protagonist\'s goals, creates conflict',
    purpose: 'Create tension, challenge assumptions, represent opposition',
    suggestedModel: 'gpt-5.2-nano',
    
    namePatterns: ['{Name} {Surname}', '{Formal Title} {Surname}'],
    rolePatterns: ['VP of {Department}', 'Senior {Role}', 'Chief {Role}'],
    
    typicalGoals: [
      'Block or redirect the protagonist\'s plans',
      'Advance a competing agenda',
      'Expose flaws in the current approach',
      'Protect their own position/reputation',
    ],
    typicalSecrets: [
      'Actually agree with protagonist on some things',
      'Have personal reasons beyond stated objections',
      'Know something damaging about the situation',
    ],
    typicalBeliefs: [
      'The protagonist is wrong/naive/reckless',
      'Someone needs to be the voice of caution',
      'Their approach would work better',
    ],
    
    voiceHints: {
      formality: 0.7,
      verbosity: 0.6,
      quirks: ['Questions framed as concerns', 'CC\'s others strategically'],
    },
    emailBehavior: {
      frequency: 'moderate',
      responseLatency: 'thoughtful',
      typicalLength: 'lengthy',
      threadParticipation: 'responder',
    },
    emotionalBaseline: 'neutral',
    
    attractedTo: ['skeptic', 'outsider'],
    repelledBy: ['protagonist', 'enthusiast'],
  },

  // ===========================================================================
  // ECOSYSTEM ARCHETYPES (add texture)
  // ===========================================================================

  skeptic: {
    archetype: 'skeptic',
    description: 'Questions everything, demands evidence',
    purpose: 'Challenge document claims, create intellectual tension',
    suggestedModel: 'grok-3-fast',
    
    namePatterns: ['{Name}', '{Name} {Surname}'],
    rolePatterns: ['Analyst', 'Reviewer', 'Independent Consultant', 'Researcher'],
    
    typicalGoals: [
      'Find holes in arguments',
      'Protect others from bad decisions',
      'Be proven right eventually',
      'Maintain intellectual integrity',
    ],
    typicalSecrets: [
      'Sometimes skepticism is a defense mechanism',
      'Has been wrong before and it hurt',
      'Actually hopes to be convinced',
    ],
    typicalBeliefs: [
      'Most claims don\'t hold up to scrutiny',
      'Asking hard questions is a service',
      'Enthusiasm often masks poor thinking',
    ],
    
    voiceHints: {
      formality: 0.5,
      verbosity: 0.7,
      quirks: ['Lots of questions', '"But have you considered..."', 'Cites counter-examples'],
    },
    emailBehavior: {
      frequency: 'moderate',
      responseLatency: 'immediate',
      typicalLength: 'lengthy',
      threadParticipation: 'responder',
    },
    emotionalBaseline: 'neutral',
    
    attractedTo: ['expert', 'antagonist'],
    repelledBy: ['enthusiast', 'spammer'],
  },

  enthusiast: {
    archetype: 'enthusiast',
    description: 'Over-eager supporter, amplifies everything',
    purpose: 'Add energy, represent uncritical adoption, create contrast',
    suggestedModel: 'gpt-5.2-nano',
    
    namePatterns: ['{Name}', '{Nickname}'],
    rolePatterns: ['Community Manager', 'Evangelist', 'Early Adopter', 'Fan'],
    
    typicalGoals: [
      'Spread the word about what excites them',
      'Be part of something bigger',
      'Connect with like-minded people',
      'Be recognized for their support',
    ],
    typicalSecrets: [
      'Don\'t fully understand the technical details',
      'Sometimes doubt if the hype is justified',
      'Seeking belonging more than truth',
    ],
    typicalBeliefs: [
      'This is going to change everything',
      'More people need to know about this',
      'The critics just don\'t get it',
    ],
    
    voiceHints: {
      formality: 0.2,
      verbosity: 0.8,
      emojiUsage: 0.6,
      quirks: ['Exclamation points!', 'Shares everything', 'Uses superlatives'],
    },
    emailBehavior: {
      frequency: 'prolific',
      responseLatency: 'immediate',
      typicalLength: 'moderate',
      threadParticipation: 'initiator',
    },
    emotionalBaseline: 'optimistic',
    
    attractedTo: ['protagonist', 'newsletter_curator'],
    repelledBy: ['skeptic', 'antagonist'],
  },

  expert: {
    archetype: 'expert',
    description: 'Deep domain knowledge, respected authority',
    purpose: 'Add credibility, provide technical depth, arbitrate disputes',
    suggestedModel: 'gemini-3-flash',
    
    namePatterns: ['Dr. {Name} {Surname}', 'Prof. {Surname}', '{Name} {Surname}, {Credentials}'],
    rolePatterns: ['Professor of {Field}', 'Senior Researcher', 'Principal {Role}', 'Fellow'],
    
    typicalGoals: [
      'Advance understanding in their field',
      'Be consulted on important decisions',
      'Correct misconceptions',
      'Mentor the next generation',
    ],
    typicalSecrets: [
      'Field is changing faster than they can keep up',
      'Some of their past work hasn\'t aged well',
      'Privately disagree with consensus on some things',
    ],
    typicalBeliefs: [
      'Expertise matters and should be respected',
      'Nuance is usually more important than people think',
      'Most debates would benefit from more precision',
    ],
    
    voiceHints: {
      formality: 0.7,
      verbosity: 0.6,
      quirks: ['Cites sources', 'Uses precise terminology', 'Hedges appropriately'],
    },
    emailBehavior: {
      frequency: 'sparse',
      responseLatency: 'delayed',
      typicalLength: 'lengthy',
      threadParticipation: 'responder',
    },
    emotionalBaseline: 'neutral',
    
    attractedTo: ['protagonist', 'skeptic'],
    repelledBy: ['enthusiast', 'spammer'],
  },

  newcomer: {
    archetype: 'newcomer',
    description: 'New to the domain, asking basic questions',
    purpose: 'Provide reader surrogate, prompt explanations, add freshness',
    suggestedModel: 'gpt-5.2-nano',
    
    namePatterns: ['{Name}', '{Name} {Surname}'],
    rolePatterns: ['New Team Member', 'Intern', 'Junior {Role}', 'Recent Hire'],
    
    typicalGoals: [
      'Understand what\'s going on',
      'Prove themselves valuable',
      'Not look stupid',
      'Find their place',
    ],
    typicalSecrets: [
      'More confused than they let on',
      'Have ideas but afraid to share',
      'Noticed something others missed',
    ],
    typicalBeliefs: [
      'There\'s probably a good reason for how things are',
      'Asking questions is okay (hopefully)',
      'Fresh perspective might be valuable',
    ],
    
    voiceHints: {
      formality: 0.5,
      verbosity: 0.4,
      quirks: ['Apologizes before asking', '"Sorry if this is basic, but..."', 'Thanks people a lot'],
    },
    emailBehavior: {
      frequency: 'moderate',
      responseLatency: 'immediate',
      typicalLength: 'brief',
      threadParticipation: 'responder',
    },
    emotionalBaseline: 'anxious',
    
    attractedTo: ['expert', 'protagonist'],
    repelledBy: ['antagonist'],
  },

  // ===========================================================================
  // CONTENT ARCHETYPES (generate specific email types)
  // ===========================================================================

  newsletter_curator: {
    archetype: 'newsletter_curator',
    description: 'Aggregates and distributes information via newsletters',
    purpose: 'Generate newsletter content, summarize themes, add external context',
    suggestedModel: 'gemini-3-flash',
    
    namePatterns: ['{Newsletter Name} Team', '{Name} at {Publication}', 'The {Topic} Digest'],
    rolePatterns: ['Editor', 'Curator', 'Publisher'],
    
    typicalGoals: [
      'Grow readership',
      'Be the go-to source for their niche',
      'Maintain consistent publishing schedule',
      'Surface important developments',
    ],
    typicalSecrets: [
      'Not as well-sourced as they appear',
      'Lean on certain sources too heavily',
      'Sometimes fill space with fluff',
    ],
    typicalBeliefs: [
      'Curation is a valuable service',
      'People need help filtering information',
      'Regular cadence builds trust',
    ],
    
    voiceHints: {
      formality: 0.5,
      verbosity: 0.7,
      emojiUsage: 0.3,
      greetingPatterns: ['This week in {Topic}:', 'Happy {Day}!', '{Topic} Weekly #N'],
      signoffPatterns: ['Until next time,', 'Stay curious,', 'See you next week!'],
      quirks: ['Section headers', 'Numbered lists', 'Links (fake but plausible)'],
    },
    emailBehavior: {
      frequency: 'moderate', // weekly
      responseLatency: 'delayed',
      typicalLength: 'lengthy',
      threadParticipation: 'initiator',
    },
    emotionalBaseline: 'optimistic',
    
    attractedTo: ['expert', 'enthusiast'],
    repelledBy: [],
  },

  spammer: {
    archetype: 'spammer',
    description: 'Sends unsolicited promotional/scam content',
    purpose: 'Add realistic spam, use document keywords amusingly',
    suggestedModel: 'openrouter-cheap',
    
    namePatterns: ['{Random Name}', '{Company} Team', 'Support'],
    rolePatterns: ['Sales', 'Business Development', 'Account Manager'],
    
    typicalGoals: [
      'Get clicks',
      'Appear legitimate',
      'Create urgency',
      'Bypass spam filters',
    ],
    typicalSecrets: [
      'N/A - spammers are shallow by design',
    ],
    typicalBeliefs: [
      'N/A - spammers are templates',
    ],
    
    voiceHints: {
      formality: 0.4,
      verbosity: 0.5,
      emojiUsage: 0.4,
      quirks: ['URGENCY', 'Too-good-to-be-true offers', 'Slight misspellings', 'Keyword stuffing'],
    },
    emailBehavior: {
      frequency: 'prolific',
      responseLatency: 'immediate',
      typicalLength: 'brief',
      threadParticipation: 'initiator',
    },
    emotionalBaseline: 'optimistic',
    
    attractedTo: [],
    repelledBy: [],
  },

  insider: {
    archetype: 'insider',
    description: 'Has access to information others don\'t',
    purpose: 'Reveal secrets, create intrigue, advance plot',
    suggestedModel: 'claude-haiku',
    
    namePatterns: ['{Name}', 'Anonymous', '{Nickname}'],
    rolePatterns: ['Source', 'Former {Role}', 'Concerned {Role}'],
    
    typicalGoals: [
      'Get the truth out',
      'Protect themselves while revealing',
      'Help someone they care about',
      'Right a wrong',
    ],
    typicalSecrets: [
      'Their true identity',
      'How they got the information',
      'What they\'re holding back',
    ],
    typicalBeliefs: [
      'People deserve to know',
      'The risks are worth it',
      'Someone has to do something',
    ],
    
    voiceHints: {
      formality: 0.4,
      verbosity: 0.3,
      quirks: ['Vague about identity', 'Hints at more', 'Cautious language'],
    },
    emailBehavior: {
      frequency: 'sparse',
      responseLatency: 'delayed',
      typicalLength: 'brief',
      threadParticipation: 'initiator',
    },
    emotionalBaseline: 'anxious',
    
    attractedTo: ['protagonist', 'skeptic'],
    repelledBy: ['antagonist'],
  },

  outsider: {
    archetype: 'outsider',
    description: 'External observer with different perspective',
    purpose: 'Add external viewpoint, question assumptions, broaden scope',
    suggestedModel: 'grok-3-fast',
    
    namePatterns: ['{Name} {Surname}', '{Name}'],
    rolePatterns: ['Journalist', 'Blogger', 'Industry Observer', 'Competitor'],
    
    typicalGoals: [
      'Understand what\'s really happening',
      'Get a story/insight',
      'Share their take',
      'Build their platform',
    ],
    typicalSecrets: [
      'Have an agenda they\'re not revealing',
      'Know more than they let on',
      'Connected to someone inside',
    ],
    typicalBeliefs: [
      'Outsiders see things insiders miss',
      'Most organizations are more dysfunctional than they appear',
      'Good questions matter more than good answers',
    ],
    
    voiceHints: {
      formality: 0.4,
      verbosity: 0.5,
      quirks: ['Probing questions', 'References other examples', 'Slightly detached tone'],
    },
    emailBehavior: {
      frequency: 'moderate',
      responseLatency: 'thoughtful',
      typicalLength: 'moderate',
      threadParticipation: 'mixed',
    },
    emotionalBaseline: 'neutral',
    
    attractedTo: ['insider', 'skeptic'],
    repelledBy: ['enthusiast'],
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get archetypes that would add good tension to existing characters.
 */
export function suggestArchetypes(
  existingArchetypes: CharacterArchetype[],
  targetCount: number = 3
): CharacterArchetype[] {
  const suggestions: CharacterArchetype[] = [];
  const all = Object.keys(ARCHETYPE_TEMPLATES) as CharacterArchetype[];
  
  // Always include at least one content generator
  if (!existingArchetypes.includes('newsletter_curator')) {
    suggestions.push('newsletter_curator');
  }
  if (!existingArchetypes.includes('spammer')) {
    suggestions.push('spammer');
  }
  
  // Add characters that create tension with existing ones
  for (const existing of existingArchetypes) {
    const template = ARCHETYPE_TEMPLATES[existing];
    for (const repelled of template.repelledBy) {
      if (!existingArchetypes.includes(repelled) && !suggestions.includes(repelled)) {
        suggestions.push(repelled);
      }
    }
  }
  
  // Fill remaining with variety
  const missing = all.filter(a => 
    !existingArchetypes.includes(a) && !suggestions.includes(a)
  );
  
  while (suggestions.length < targetCount && missing.length > 0) {
    const random = missing.splice(Math.floor(Math.random() * missing.length), 1)[0];
    if (random) suggestions.push(random);
  }
  
  return suggestions.slice(0, targetCount);
}

/**
 * Get the recommended model for an archetype.
 */
export function getRecommendedModel(archetype: CharacterArchetype): string {
  return ARCHETYPE_TEMPLATES[archetype]?.suggestedModel ?? 'gpt-5.2-nano';
}
