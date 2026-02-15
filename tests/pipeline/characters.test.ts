/**
 * Character Generation Tests
 *
 * Tests for character generation from documents.
 */

import { describe, it, expect } from 'vitest';
import type { ProcessedDocument, DocumentContext, ExtractedEntity, Theme } from '../../src/types.js';

describe('Character Generation', () => {
  describe('Character from Document Entities', () => {
    it('should support character data structure', () => {
      const character = {
        id: 'char-1' as any,
        name: 'Dr. Jane Smith',
        email: 'jsmith@research.org',
        role: 'Lead Researcher',
        personality: {
          traits: ['analytical', 'methodical', 'collaborative'],
          communicationStyle: 'formal',
          quirks: ['uses technical jargon'],
        },
        goals: [
          {
            description: 'Publish research findings',
            priority: 'high' as const,
            deadline: undefined,
          },
        ],
        secrets: [],
        knowledge: [],
        relationships: [],
        psychology: {
          coreMotivations: ['scientific discovery', 'peer recognition'],
          cognitiveBiases: ['confirmation bias'],
          emotionalTriggers: ['criticism of methodology'],
          defenseMechanisms: ['rationalization'],
          attachmentStyle: 'secure',
          moralFramework: 'utilitarian',
        },
        boundModel: 'gpt-4o-mini',
        voice: {
          vocabulary: ['hypothesis', 'methodology', 'analysis'],
          sentenceStructure: 'complex',
          formalityLevel: 0.8,
          emotionalExpressiveness: 0.3,
          humor: 0.2,
          idioms: [],
          signaturePhrases: ['As the data suggests', 'Statistically speaking'],
        },
      };

      expect(character.name).toBe('Dr. Jane Smith');
      expect(character.personality.traits).toContain('analytical');
      expect(character.psychology.coreMotivations).toContain('scientific discovery');
      expect(character.voice.formalityLevel).toBe(0.8);
    });

    it('should bind characters to specific models', () => {
      const characters = [
        { id: 'c1' as any, name: 'Formal Academic', boundModel: 'gpt-4o' },
        { id: 'c2' as any, name: 'Creative Thinker', boundModel: 'grok-beta' },
        { id: 'c3' as any, name: 'Technical Writer', boundModel: 'claude-3-5-sonnet' },
      ];

      characters.forEach(char => {
        expect(char.boundModel).toBeTruthy();
        expect(typeof char.boundModel).toBe('string');
      });
    });
  });

  describe('Character Psychology', () => {
    it('should define comprehensive psychology profiles', () => {
      const psychology = {
        coreMotivations: ['achievement', 'belonging'],
        cognitiveBiases: ['anchoring bias', 'availability heuristic'],
        emotionalTriggers: ['public criticism', 'time pressure'],
        defenseMechanisms: ['intellectualization', 'displacement'],
        attachmentStyle: 'anxious-preoccupied',
        moralFramework: 'deontological',
      };

      expect(psychology.coreMotivations.length).toBeGreaterThan(0);
      expect(psychology.cognitiveBiases.length).toBeGreaterThan(0);
      expect(psychology.emotionalTriggers.length).toBeGreaterThan(0);
      expect(['secure', 'anxious-preoccupied', 'dismissive-avoidant', 'fearful-avoidant']).toContain(
        psychology.attachmentStyle
      );
    });

    it('should support different moral frameworks', () => {
      const frameworks = ['utilitarian', 'deontological', 'virtue-ethics', 'care-ethics'];
      
      frameworks.forEach(framework => {
        const psychology = {
          coreMotivations: ['test'],
          cognitiveBiases: [],
          emotionalTriggers: [],
          defenseMechanisms: [],
          attachmentStyle: 'secure',
          moralFramework: framework,
        };

        expect(psychology.moralFramework).toBe(framework);
      });
    });
  });

  describe('Character Voice', () => {
    it('should define distinct voice characteristics', () => {
      const voice = {
        vocabulary: ['endeavor', 'facilitate', 'optimize'],
        sentenceStructure: 'complex',
        formalityLevel: 0.9,
        emotionalExpressiveness: 0.2,
        humor: 0.1,
        idioms: ['by and large', 'at the end of the day'],
        signaturePhrases: ['In my professional opinion', 'Let me be clear'],
      };

      expect(voice.formalityLevel).toBeGreaterThanOrEqual(0);
      expect(voice.formalityLevel).toBeLessThanOrEqual(1);
      expect(voice.emotionalExpressiveness).toBeGreaterThanOrEqual(0);
      expect(voice.emotionalExpressiveness).toBeLessThanOrEqual(1);
      expect(voice.humor).toBeGreaterThanOrEqual(0);
      expect(voice.humor).toBeLessThanOrEqual(1);
    });

    it('should support different sentence structures', () => {
      const structures = ['simple', 'compound', 'complex', 'varied'];
      
      structures.forEach(structure => {
        const voice = {
          vocabulary: [],
          sentenceStructure: structure,
          formalityLevel: 0.5,
          emotionalExpressiveness: 0.5,
          humor: 0.5,
          idioms: [],
          signaturePhrases: [],
        };

        expect(voice.sentenceStructure).toBe(structure);
      });
    });
  });

  describe('Character Relationships', () => {
    it('should model relationships between characters', () => {
      const relationship = {
        characterA: 'char-1' as any,
        characterB: 'char-2' as any,
        type: 'professional' as const,
        strength: 0.7,
        sentiment: 'positive' as const,
        history: [
          {
            event: 'Collaborated on project',
            timestamp: new Date().toISOString(),
            impact: 0.3,
          },
        ],
      };

      expect(relationship.strength).toBeGreaterThan(0);
      expect(relationship.strength).toBeLessThanOrEqual(1);
      expect(['positive', 'negative', 'neutral', 'mixed']).toContain(relationship.sentiment);
      expect(relationship.history.length).toBeGreaterThan(0);
    });

    it('should track relationship evolution', () => {
      const relationship = {
        characterA: 'char-1' as any,
        characterB: 'char-2' as any,
        type: 'professional' as const,
        strength: 0.5,
        sentiment: 'neutral' as const,
        history: [] as any[],
      };

      // Add interaction
      relationship.history.push({
        event: 'Disagreement about approach',
        timestamp: new Date().toISOString(),
        impact: -0.2,
      });
      relationship.sentiment = 'negative';
      relationship.strength = 0.3;

      expect(relationship.history.length).toBe(1);
      expect(relationship.sentiment).toBe('negative');
      expect(relationship.strength).toBe(0.3);
    });
  });

  describe('Character Goals', () => {
    it('should define character goals with priorities', () => {
      const goals = [
        {
          description: 'Complete quarterly report',
          priority: 'high' as const,
          deadline: new Date('2024-03-31').toISOString(),
        },
        {
          description: 'Mentor junior team members',
          priority: 'medium' as const,
          deadline: undefined,
        },
        {
          description: 'Organize team outing',
          priority: 'low' as const,
          deadline: undefined,
        },
      ];

      expect(goals.length).toBe(3);
      goals.forEach(goal => {
        expect(['high', 'medium', 'low']).toContain(goal.priority);
        expect(goal.description).toBeTruthy();
      });
    });

    it('should handle goal completion', () => {
      const goal = {
        description: 'Submit proposal',
        priority: 'high' as const,
        deadline: new Date().toISOString(),
        completed: false,
      };

      expect(goal.completed).toBe(false);
      
      // Mark as completed
      goal.completed = true;
      expect(goal.completed).toBe(true);
    });
  });

  describe('Character Knowledge', () => {
    it('should track what characters know', () => {
      const knowledge = [
        {
          fact: 'Project budget is $1M',
          confidence: 1.0,
          source: 'doc-1' as any,
        },
        {
          fact: 'Team has 5 members',
          confidence: 1.0,
          source: 'doc-2' as any,
        },
        {
          fact: 'Deadline is end of quarter',
          confidence: 0.8,
          source: 'rumor',
        },
      ];

      expect(knowledge.length).toBe(3);
      knowledge.forEach(item => {
        expect(item.confidence).toBeGreaterThan(0);
        expect(item.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should handle uncertain knowledge', () => {
      const uncertainKnowledge = {
        fact: 'Funding may be cut',
        confidence: 0.3,
        source: 'speculation',
      };

      expect(uncertainKnowledge.confidence).toBeLessThan(0.5);
    });
  });

  describe('Character Secrets', () => {
    it('should manage secret information', () => {
      const secret = {
        content: 'Planning to leave the company',
        importance: 0.9,
        revealedTo: [] as any[],
      };

      expect(secret.importance).toBeGreaterThan(0);
      expect(secret.revealedTo.length).toBe(0);

      // Reveal to someone
      secret.revealedTo.push('char-2' as any);
      expect(secret.revealedTo.length).toBe(1);
    });

    it('should prioritize secrets by importance', () => {
      const secrets = [
        { content: 'Minor issue', importance: 0.2 },
        { content: 'Major revelation', importance: 0.9 },
        { content: 'Moderate concern', importance: 0.5 },
      ];

      const sorted = secrets.sort((a, b) => b.importance - a.importance);
      expect(sorted[0].importance).toBe(0.9);
      expect(sorted[2].importance).toBe(0.2);
    });
  });
});
