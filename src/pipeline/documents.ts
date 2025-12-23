/**
 * Document Processing Pipeline
 *
 * Handles document ingestion, chunking, and entity extraction.
 */

import { v4 as uuid } from 'uuid';
import type {
  RawDocument,
  ProcessedDocument,
  DocumentChunk,
  ExtractedEntity,
  Theme,
} from '../types.js';
import type { ModelRouter } from '../models/router.js';

// =============================================================================
// DOCUMENT CHUNKING
// =============================================================================

interface ChunkOptions {
  maxTokens?: number;
  overlap?: number;
}

/**
 * Estimate token count (rough approximation: 4 chars = 1 token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Chunk document into semantically meaningful pieces.
 */
export function chunkDocument(
  doc: RawDocument,
  options: ChunkOptions = {}
): DocumentChunk[] {
  const maxTokens = options.maxTokens ?? 1000;
  const overlap = options.overlap ?? 100;

  const chunks: DocumentChunk[] = [];
  const content = doc.content;

  // Split by paragraphs first
  const paragraphs = content.split(/\n\s*\n/);
  let currentChunk = '';
  let startOffset = 0;
  let currentOffset = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph);

    if (estimateTokens(currentChunk) + paragraphTokens > maxTokens && currentChunk) {
      // Save current chunk
      chunks.push({
        id: uuid(),
        documentId: doc.id,
        content: currentChunk.trim(),
        startOffset,
        endOffset: currentOffset,
        tokenEstimate: estimateTokens(currentChunk),
      });

      // Start new chunk with overlap
      const overlapText = getOverlapText(currentChunk, overlap);
      currentChunk = overlapText + paragraph + '\n\n';
      startOffset = currentOffset - overlapText.length;
    } else {
      currentChunk += paragraph + '\n\n';
    }

    currentOffset += paragraph.length + 2;
  }

  // Save final chunk
  if (currentChunk.trim()) {
    chunks.push({
      id: uuid(),
      documentId: doc.id,
      content: currentChunk.trim(),
      startOffset,
      endOffset: currentOffset,
      tokenEstimate: estimateTokens(currentChunk),
    });
  }

  return chunks;
}

function getOverlapText(text: string, targetTokens: number): string {
  const targetChars = targetTokens * 4;
  if (text.length <= targetChars) return text;

  // Find a sentence break near the target
  const endPortion = text.slice(-targetChars * 1.5);
  const sentenceBreak = endPortion.search(/[.!?]\s+[A-Z]/);

  if (sentenceBreak > 0) {
    return endPortion.slice(sentenceBreak + 2);
  }

  return text.slice(-targetChars);
}

// =============================================================================
// ENTITY EXTRACTION
// =============================================================================

interface ExtractionResult {
  entities: ExtractedEntity[];
  themes: Theme[];
}

/**
 * Extract entities and themes from document chunks using LLM.
 */
export async function extractFromChunks(
  chunks: DocumentChunk[],
  router: ModelRouter
): Promise<ExtractionResult> {
  const allEntities: ExtractedEntity[] = [];
  const allThemes: Theme[] = [];

  // Process chunks in parallel batches
  const batchSize = 5;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((chunk) => extractFromChunk(chunk, router))
    );

    for (const result of results) {
      allEntities.push(...result.entities);
      allThemes.push(...result.themes);
    }
  }

  // Merge duplicate entities
  const mergedEntities = mergeEntities(allEntities);

  // Merge and rank themes
  const mergedThemes = mergeThemes(allThemes);

  return {
    entities: mergedEntities,
    themes: mergedThemes,
  };
}

async function extractFromChunk(
  chunk: DocumentChunk,
  router: ModelRouter
): Promise<ExtractionResult> {
  const prompt = `Analyze this text and extract:
1. Entities (people, organizations, concepts, events, locations)
2. Themes (main topics, ideas, conflicts)

TEXT:
${chunk.content}

Respond with JSON in this exact format:
{
  "entities": [
    {
      "type": "person|organization|concept|event|location",
      "name": "string",
      "aliases": ["string"],
      "attributes": {},
      "confidence": 0.0-1.0
    }
  ],
  "themes": [
    {
      "name": "string",
      "description": "string",
      "weight": 0.0-1.0
    }
  ]
}`;

  try {
    const result = await router.generateStructured<{
      entities: Array<{
        type: 'person' | 'organization' | 'concept' | 'event' | 'location';
        name: string;
        aliases?: string[];
        attributes?: Record<string, unknown>;
        confidence?: number;
      }>;
      themes: Array<{
        name: string;
        description: string;
        weight?: number;
      }>;
    }>('gemini-flash', prompt, { temperature: 0.3 });

    const entities: ExtractedEntity[] = result.entities.map((e) => ({
      id: uuid(),
      type: e.type,
      name: e.name,
      aliases: e.aliases ?? [],
      mentions: [
        {
          chunkId: chunk.id,
          context: chunk.content.slice(0, 200),
        },
      ],
      attributes: e.attributes ?? {},
      confidence: e.confidence ?? 0.8,
    }));

    const themes: Theme[] = result.themes.map((t) => ({
      id: uuid(),
      name: t.name,
      description: t.description,
      relevantChunks: [chunk.id],
      weight: t.weight ?? 0.5,
    }));

    return { entities, themes };
  } catch (error) {
    console.error('Extraction failed for chunk:', error);
    return { entities: [], themes: [] };
  }
}

/**
 * Merge duplicate entities by name/alias matching.
 */
function mergeEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
  const merged: Map<string, ExtractedEntity> = new Map();

  for (const entity of entities) {
    const normalizedName = entity.name.toLowerCase().trim();
    const existing = merged.get(normalizedName);

    if (existing) {
      // Merge mentions
      existing.mentions.push(...entity.mentions);
      // Merge aliases
      existing.aliases = [...new Set([...existing.aliases, ...entity.aliases])];
      // Average confidence
      existing.confidence = (existing.confidence + entity.confidence) / 2;
      // Merge attributes
      existing.attributes = { ...existing.attributes, ...entity.attributes };
    } else {
      merged.set(normalizedName, { ...entity });

      // Also index by aliases
      const mergedEntity = merged.get(normalizedName);
      if (mergedEntity) {
        for (const alias of entity.aliases) {
          const normalizedAlias = alias.toLowerCase().trim();
          if (!merged.has(normalizedAlias)) {
            merged.set(normalizedAlias, mergedEntity);
          }
        }
      }
    }
  }

  // Return unique entities
  const seen = new Set<string>();
  const result: ExtractedEntity[] = [];

  for (const entity of merged.values()) {
    if (!seen.has(entity.id)) {
      seen.add(entity.id);
      result.push(entity);
    }
  }

  return result;
}

/**
 * Merge and rank themes.
 */
function mergeThemes(themes: Theme[]): Theme[] {
  const merged: Map<string, Theme> = new Map();

  for (const theme of themes) {
    const normalizedName = theme.name.toLowerCase().trim();
    const existing = merged.get(normalizedName);

    if (existing) {
      existing.relevantChunks.push(...theme.relevantChunks);
      existing.weight = Math.max(existing.weight, theme.weight);
    } else {
      merged.set(normalizedName, { ...theme });
    }
  }

  // Sort by weight
  return Array.from(merged.values()).sort((a, b) => b.weight - a.weight);
}

// =============================================================================
// RELATIONSHIP INFERENCE
// =============================================================================

export interface InferredRelationship {
  entity1: string;
  entity2: string;
  type: string;
  description: string;
  strength: number;
}

/**
 * Infer relationships between entities.
 */
export async function inferRelationships(
  entities: ExtractedEntity[],
  chunks: DocumentChunk[],
  router: ModelRouter
): Promise<InferredRelationship[]> {
  // Only process if we have enough entities
  if (entities.length < 2) return [];

  // Find entity co-occurrences in chunks
  const coOccurrences: Map<string, Set<string>> = new Map();

  for (const chunk of chunks) {
    const chunkText = chunk.content.toLowerCase();
    const presentEntities: string[] = [];

    for (const entity of entities) {
      if (
        chunkText.includes(entity.name.toLowerCase()) ||
        entity.aliases.some((a) => chunkText.includes(a.toLowerCase()))
      ) {
        presentEntities.push(entity.id);
      }
    }

    // Record co-occurrences
    for (let i = 0; i < presentEntities.length; i++) {
      for (let j = i + 1; j < presentEntities.length; j++) {
        const key = [presentEntities[i], presentEntities[j]].sort().join('|');
        let chunkSet = coOccurrences.get(key);
        if (!chunkSet) {
          chunkSet = new Set();
          coOccurrences.set(key, chunkSet);
        }
        chunkSet.add(chunk.id);
      }
    }
  }

  // Infer relationships for significant co-occurrences
  const relationships: InferredRelationship[] = [];

  for (const [key, chunkIds] of coOccurrences) {
    if (chunkIds.size < 1) continue;

    const [id1, id2] = key.split('|');
    const entity1 = entities.find((e) => e.id === id1);
    const entity2 = entities.find((e) => e.id === id2);

    if (!entity1 || !entity2) continue;

    // Get context from a relevant chunk
    const contextChunk = chunks.find((c) => chunkIds.has(c.id));

    const prompt = `Given these two entities and their context, describe their relationship:

Entity 1: ${entity1.name} (${entity1.type})
Entity 2: ${entity2.name} (${entity2.type})

Context:
${contextChunk?.content.slice(0, 500) ?? 'No direct context available'}

Respond with JSON:
{
  "type": "colleagues|friends|rivals|mentor-mentee|collaborators|adversaries|acquaintances",
  "description": "Brief description of relationship",
  "strength": 0.0-1.0
}`;

    try {
      const result = await router.generateStructured<{
        type: string;
        description: string;
        strength: number;
      }>('gemini-flash', prompt, { temperature: 0.3 });

      relationships.push({
        entity1: entity1.id,
        entity2: entity2.id,
        type: result.type,
        description: result.description,
        strength: result.strength,
      });
    } catch (error) {
      console.error('Relationship inference failed:', error);
    }
  }

  return relationships;
}

// =============================================================================
// FULL PROCESSING PIPELINE
// =============================================================================

/**
 * Process a raw document through the full extraction pipeline.
 */
export async function processDocument(
  doc: RawDocument,
  router: ModelRouter
): Promise<ProcessedDocument> {
  const startTime = Date.now();

  // Step 1: Chunk the document
  const chunks = chunkDocument(doc);

  // Step 2: Extract entities and themes
  const { entities, themes } = await extractFromChunks(chunks, router);

  const processingTimeMs = Date.now() - startTime;

  return {
    id: doc.id,
    raw: doc,
    chunks,
    extractedEntities: entities,
    themes,
    processingMetadata: {
      chunkCount: chunks.length,
      tokenEstimate: chunks.reduce((sum, c) => sum + c.tokenEstimate, 0),
      processingTimeMs,
    },
  };
}

/**
 * Process multiple documents.
 */
export async function processDocuments(
  docs: RawDocument[],
  router: ModelRouter
): Promise<ProcessedDocument[]> {
  const results: ProcessedDocument[] = [];

  for (const doc of docs) {
    const processed = await processDocument(doc, router);
    results.push(processed);
  }

  return results;
}
