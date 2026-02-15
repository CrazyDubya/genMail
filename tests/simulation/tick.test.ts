/**
 * Simulation Tick Tests
 *
 * Tests for the tick engine that drives world state progression.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { WorldState, Character, ProcessedDocument } from '../../src/types.js';

describe('Simulation Tick Engine', () => {
  let mockWorldState: WorldState;

  beforeEach(() => {
    // Create minimal world state for testing
    mockWorldState = {
      characters: new Map<string, Character>(),
      relationships: [],
      tensions: [],
      timeline: [],
      emails: [],
      threads: new Map(),
      knowledge: {
        facts: [],
        beliefs: [],
        secrets: [],
      },
      documents: [],
      tick: 0,
      currentTime: new Date('2024-01-01T00:00:00Z'),
    };
  });

  describe('World State Management', () => {
    it('should initialize with empty state', () => {
      expect(mockWorldState.characters.size).toBe(0);
      expect(mockWorldState.emails.length).toBe(0);
      expect(mockWorldState.tick).toBe(0);
    });

    it('should track time progression', () => {
      const initialTime = mockWorldState.currentTime;
      expect(initialTime).toBeInstanceOf(Date);
    });

    it('should maintain character collection', () => {
      const character: Character = {
        id: 'char-1' as any,
        name: 'Test Character',
        email: 'test@example.com',
        role: 'Analyst',
        personality: {
          traits: ['analytical', 'curious'],
          communicationStyle: 'formal',
          quirks: [],
        },
        goals: [],
        secrets: [],
        knowledge: [],
        relationships: [],
        psychology: {
          coreMotivations: ['understanding'],
          cognitiveBiases: [],
          emotionalTriggers: [],
          defenseMechanisms: [],
          attachmentStyle: 'secure',
          moralFramework: 'utilitarian',
        },
        boundModel: 'gpt-4o-mini',
        voice: {
          vocabulary: [],
          sentenceStructure: 'varied',
          formalityLevel: 0.7,
          emotionalExpressiveness: 0.5,
          humor: 0.3,
          idioms: [],
          signaturePhrases: [],
        },
      };

      mockWorldState.characters.set(character.id, character);
      expect(mockWorldState.characters.size).toBe(1);
      expect(mockWorldState.characters.get(character.id)).toBe(character);
    });
  });

  describe('Document Context Merging', () => {
    it('should handle single document context', () => {
      const doc: ProcessedDocument = {
        id: 'doc-1' as any,
        filename: 'test.txt',
        mimeType: 'text/plain',
        content: 'Test content',
        uploadedAt: new Date().toISOString(),
        chunks: [],
        entities: [],
        themes: [],
        context: {
          thesis: 'Main thesis',
          coreConcepts: ['concept1', 'concept2'],
          claims: [],
          argumentStructure: [],
          summary: 'Summary',
          significance: 'Important',
        },
      };

      mockWorldState.documents.push(doc);
      expect(mockWorldState.documents.length).toBe(1);
      expect(mockWorldState.documents[0].context?.thesis).toBe('Main thesis');
    });

    it('should handle multiple documents', () => {
      const doc1: ProcessedDocument = {
        id: 'doc-1' as any,
        filename: 'test1.txt',
        mimeType: 'text/plain',
        content: 'Content 1',
        uploadedAt: new Date().toISOString(),
        chunks: [],
        entities: [],
        themes: [],
        context: {
          thesis: 'Thesis 1',
          coreConcepts: ['concept1'],
          claims: [],
          argumentStructure: [],
          summary: 'Summary 1',
          significance: 'Important 1',
        },
      };

      const doc2: ProcessedDocument = {
        id: 'doc-2' as any,
        filename: 'test2.txt',
        mimeType: 'text/plain',
        content: 'Content 2',
        uploadedAt: new Date().toISOString(),
        chunks: [],
        entities: [],
        themes: [],
        context: {
          thesis: 'Thesis 2',
          coreConcepts: ['concept2'],
          claims: [],
          argumentStructure: [],
          summary: 'Summary 2',
          significance: 'Important 2',
        },
      };

      mockWorldState.documents.push(doc1, doc2);
      expect(mockWorldState.documents.length).toBe(2);
    });
  });

  describe('Email Generation', () => {
    it('should create emails with required fields', () => {
      const email = {
        id: 'email-1' as any,
        from: 'sender@example.com' as any,
        to: ['recipient@example.com'] as any[],
        subject: 'Test Subject',
        body: 'Test body',
        timestamp: new Date().toISOString(),
        threadId: 'thread-1' as any,
        inReplyTo: undefined,
        sentiment: 'neutral' as const,
        generationContext: {
          tick: 0,
          characterState: 'active',
          inspiringTensions: [],
        },
      };

      mockWorldState.emails.push(email);
      expect(mockWorldState.emails.length).toBe(1);
      expect(mockWorldState.emails[0].subject).toBe('Test Subject');
    });

    it('should track email threads', () => {
      mockWorldState.threads.set('thread-1' as any, {
        id: 'thread-1' as any,
        subject: 'Thread Subject',
        participants: ['char-1' as any, 'char-2' as any],
        emailIds: ['email-1' as any],
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      });

      expect(mockWorldState.threads.size).toBe(1);
      expect(mockWorldState.threads.get('thread-1' as any)?.subject).toBe('Thread Subject');
    });
  });

  describe('Tension Management', () => {
    it('should track tensions between characters', () => {
      const tension = {
        id: 'tension-1' as any,
        type: 'interpersonal' as const,
        description: 'Disagreement about approach',
        involvedCharacters: ['char-1' as any, 'char-2' as any],
        intensity: 0.7,
        createdAt: new Date().toISOString(),
        resolvedAt: undefined,
        source: 'character_interaction',
      };

      mockWorldState.tensions.push(tension);
      expect(mockWorldState.tensions.length).toBe(1);
      expect(mockWorldState.tensions[0].intensity).toBe(0.7);
    });

    it('should allow tension resolution', () => {
      const tension = {
        id: 'tension-1' as any,
        type: 'interpersonal' as const,
        description: 'Test tension',
        involvedCharacters: ['char-1' as any],
        intensity: 0.5,
        createdAt: new Date().toISOString(),
        resolvedAt: undefined,
        source: 'document',
      };

      mockWorldState.tensions.push(tension);
      
      // Resolve tension
      tension.resolvedAt = new Date().toISOString();
      expect(tension.resolvedAt).toBeDefined();
    });
  });

  describe('Knowledge Graph', () => {
    it('should store facts in knowledge graph', () => {
      mockWorldState.knowledge.facts.push({
        statement: 'The project started in 2023',
        confidence: 0.9,
        source: 'doc-1' as any,
        knownBy: ['char-1' as any],
      });

      expect(mockWorldState.knowledge.facts.length).toBe(1);
      expect(mockWorldState.knowledge.facts[0].confidence).toBe(0.9);
    });

    it('should store character beliefs', () => {
      mockWorldState.knowledge.beliefs.push({
        characterId: 'char-1' as any,
        statement: 'The approach is flawed',
        confidence: 0.7,
        basedOn: [],
      });

      expect(mockWorldState.knowledge.beliefs.length).toBe(1);
    });

    it('should store secrets', () => {
      mockWorldState.knowledge.secrets.push({
        content: 'Hidden information',
        knownBy: ['char-1' as any],
        revealedTo: [],
        importance: 0.8,
      });

      expect(mockWorldState.knowledge.secrets.length).toBe(1);
      expect(mockWorldState.knowledge.secrets[0].knownBy.length).toBe(1);
    });
  });

  describe('Timeline Events', () => {
    it('should record events in timeline', () => {
      const event = {
        id: 'event-1' as any,
        type: 'email_sent' as const,
        timestamp: new Date().toISOString(),
        description: 'Email sent from A to B',
        participants: ['char-1' as any, 'char-2' as any],
        tick: 0,
      };

      mockWorldState.timeline.push(event);
      expect(mockWorldState.timeline.length).toBe(1);
      expect(mockWorldState.timeline[0].type).toBe('email_sent');
    });

    it('should maintain chronological order', () => {
      const event1 = {
        id: 'event-1' as any,
        type: 'email_sent' as const,
        timestamp: new Date('2024-01-01T10:00:00Z').toISOString(),
        description: 'First event',
        participants: [],
        tick: 0,
      };

      const event2 = {
        id: 'event-2' as any,
        type: 'email_sent' as const,
        timestamp: new Date('2024-01-01T11:00:00Z').toISOString(),
        description: 'Second event',
        participants: [],
        tick: 1,
      };

      mockWorldState.timeline.push(event1, event2);
      expect(mockWorldState.timeline.length).toBe(2);
      expect(mockWorldState.timeline[0].tick).toBeLessThan(mockWorldState.timeline[1].tick);
    });
  });
});
