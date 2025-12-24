/**
 * Document Processing Pipeline
 *
 * Handles document ingestion, chunking, and entity extraction.
 *
 * NEW: Uses the understanding pipeline for deep document comprehension.
 * The key improvement is that chunks are now processed WITH document context,
 * solving the "Attention is All You Need" problem where isolated chunk
 * processing missed the document's core thesis.
 */

import { v4 as uuid } from 'uuid';
import type {
  RawDocument,
  ProcessedDocument,
  DocumentChunk,
  ExtractedEntity,
  Theme,
  DocumentContext,
} from '../types.js';
import type { ModelRouter } from '../models/router.js';
import {
  analyzeDocument,
  chunkDocumentWithContext,
  extractConceptsFromChunks,
  synthesizeConcepts,
  conceptsToEntities,
  extractThemesFromContext,
  extractAuthors,
  extractFiguresAndTables,
  detectDocumentTensions,
} from './understanding.js';
import type { EmbeddingClient } from '../models/embeddings.js';

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
        chunkIndex: chunks.length,
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
      chunkIndex: chunks.length,
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
// CHUNK EMBEDDING
// =============================================================================

export interface EmbeddingOptions {
  embeddingClient: EmbeddingClient;
  batchSize?: number;
}

/**
 * Enrich chunks with embeddings for semantic search.
 * Cost: ~$0.002 per document (text-embedding-3-small @ $0.02/1M tokens).
 */
export async function enrichChunksWithEmbeddings(
  chunks: DocumentChunk[],
  options: EmbeddingOptions
): Promise<DocumentChunk[]> {
  const { embeddingClient, batchSize = 20 } = options;

  if (chunks.length === 0) {
    return chunks;
  }

  console.log(
    `[Document Processing] Embedding ${chunks.length} chunks...`
  );

  // Extract text content from chunks
  const texts = chunks.map((c) => c.content);

  // Generate embeddings in batch
  const result = await embeddingClient.embedBatch(texts, batchSize);

  console.log(
    `[Document Processing] Embedded ${result.embeddings.length} chunks (${result.totalTokens} tokens)`
  );

  // Enrich chunks with embeddings
  return chunks.map((chunk, i) => ({
    ...chunk,
    embedding: result.embeddings[i].embedding,
  }));
}

// =============================================================================
// FULL PROCESSING PIPELINE (NEW: With Document Understanding)
// =============================================================================

export interface ProcessDocumentOptions {
  /** Optional embedding client for semantic search capability */
  embeddingClient?: EmbeddingClient;
  /** Batch size for embedding generation */
  embeddingBatchSize?: number;
}

/**
 * Process a raw document through the ENHANCED extraction pipeline.
 *
 * NEW FLOW:
 * 1. Analyze document → get thesis, structure, core concepts
 * 2. Chunk with context → larger chunks aware of document structure
 * 3. Embed chunks (optional) → generate embeddings for RAG
 * 4. Extract concepts → extract WITH document context (not isolation)
 * 5. Synthesize → build concept hierarchy
 * 6. Convert to legacy formats for compatibility
 *
 * This solves the "Attention is All You Need" problem where processing
 * chunks in isolation missed the document's core thesis and generated
 * 50 emails about "binary decoherence" instead of transformer architecture.
 */
export async function processDocument(
  doc: RawDocument,
  router: ModelRouter,
  options: ProcessDocumentOptions = {}
): Promise<ProcessedDocument> {
  const startTime = Date.now();

  console.log(`[Document Processing] Starting enhanced pipeline for: ${doc.filename}`);

  // Step 1: Deep document analysis (thesis, structure, significance)
  console.log('[Document Processing] Step 1: Analyzing document...');
  const context = await analyzeDocument(doc, router);
  console.log(`[Document Processing] Document type: ${context.documentType}`);
  console.log(`[Document Processing] Thesis: ${context.thesis.slice(0, 100)}...`);
  console.log(`[Document Processing] Core concepts: ${context.coreConcepts.join(', ')}`);

  // Step 2: Context-aware chunking (larger chunks, section-aware)
  console.log('[Document Processing] Step 2: Chunking with context...');
  let chunks = chunkDocumentWithContext(doc, context, {
    maxTokens: 2500, // Larger than before (was 1000)
    overlap: 200,
  });
  console.log(`[Document Processing] Created ${chunks.length} chunks`);

  // Step 2.5: Embed chunks (optional, enables RAG)
  if (options.embeddingClient) {
    console.log('[Document Processing] Step 2.5: Embedding chunks for RAG...');
    chunks = await enrichChunksWithEmbeddings(chunks, {
      embeddingClient: options.embeddingClient,
      batchSize: options.embeddingBatchSize ?? 20,
    });
  }

  // Step 3: Extract concepts WITH document context
  console.log('[Document Processing] Step 3: Extracting concepts with context...');
  const rawConcepts = await extractConceptsFromChunks(chunks, context, router);
  console.log(`[Document Processing] Extracted ${rawConcepts.length} raw concepts`);

  // Step 4: Synthesize concepts (build hierarchy, validate)
  console.log('[Document Processing] Step 4: Synthesizing concepts...');
  const { concepts } = await synthesizeConcepts(rawConcepts, context, router);
  console.log(`[Document Processing] ${concepts.length} concepts after synthesis`);

  // Step 5: Extract authors and relationships (for academic papers)
  if (context.documentType === 'academic_paper' || context.documentType === 'technical_doc') {
    console.log('[Document Processing] Step 5: Extracting authors...');
    const { authors, authorRelationships } = await extractAuthors(doc, router);
    if (authors.length > 0) {
      context.authors = authors;
      context.authorRelationships = authorRelationships;
      console.log(`[Document Processing] Found ${authors.length} authors, ${authorRelationships.length} relationships`);
    }
  }

  // Step 6: Extract figures and tables
  console.log('[Document Processing] Step 6: Extracting figures and tables...');
  const figures = await extractFiguresAndTables(chunks, context, router);
  if (figures.length > 0) {
    context.figures = figures;
    console.log(`[Document Processing] Extracted ${figures.length} figures/tables`);

    // Merge quantitative claims from figures into context claims
    for (const figure of figures) {
      for (const claim of figure.quantitativeClaims) {
        context.claims.push({
          statement: claim.statement,
          evidence: [`From ${figure.reference}: ${claim.source}`],
          confidence: 0.9,
        });
      }
    }
  }

  // Step 7: Detect document tensions
  console.log('[Document Processing] Step 7: Detecting document tensions...');
  const documentTensions = await detectDocumentTensions(context, chunks, router);
  if (documentTensions.length > 0) {
    context.documentTensions = documentTensions;
    console.log(`[Document Processing] Detected ${documentTensions.length} tensions`);
  }

  // Step 8: Convert to legacy formats for compatibility
  const entities = conceptsToEntities(concepts);
  const themes = extractThemesFromContext(context, concepts);

  const processingTimeMs = Date.now() - startTime;
  console.log(`[Document Processing] Complete in ${processingTimeMs}ms`);

  return {
    id: doc.id,
    raw: doc,
    context, // NEW: Document-level understanding
    chunks,
    concepts, // NEW: Rich concept extraction
    extractedEntities: entities, // Legacy compatibility
    themes,
    processingMetadata: {
      chunkCount: chunks.length,
      tokenEstimate: chunks.reduce((sum, c) => sum + c.tokenEstimate, 0),
      processingTimeMs,
    },
  };
}

/**
 * LEGACY: Process using old pipeline (for comparison/fallback).
 */
export async function processDocumentLegacy(
  doc: RawDocument,
  router: ModelRouter
): Promise<ProcessedDocument> {
  const startTime = Date.now();

  // Old flow: chunk → extract in isolation
  const chunks = chunkDocument(doc);
  const { entities, themes } = await extractFromChunks(chunks, router);

  const processingTimeMs = Date.now() - startTime;

  // Create minimal context for compatibility
  const fallbackContext: DocumentContext = {
    documentType: 'unknown',
    thesis: doc.content.slice(0, 500),
    summary: doc.content.slice(0, 2000),
    argumentStructure: [],
    coreConcepts: themes.slice(0, 5).map((t) => t.name),
    structure: [{ title: 'Document', startOffset: 0, endOffset: doc.content.length }],
    claims: [],
    significance: '',
  };

  return {
    id: doc.id,
    raw: doc,
    context: fallbackContext,
    chunks: chunks.map((c, i) => ({ ...c, chunkIndex: i })),
    concepts: [], // No concepts in legacy mode
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
 * Process multiple documents in parallel.
 * Uses Promise.allSettled to handle partial failures gracefully.
 */
export async function processDocuments(
  docs: RawDocument[],
  router: ModelRouter,
  options: ProcessDocumentOptions = {}
): Promise<ProcessedDocument[]> {
  if (docs.length === 0) {
    return [];
  }

  // Process all documents in parallel
  const results = await Promise.allSettled(
    docs.map((doc) => processDocument(doc, router, options))
  );

  // Collect successful results, log failures
  const processed: ProcessedDocument[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      processed.push(result.value);
    } else {
      console.error(
        `[Documents] Failed to process document ${docs[i].filename}:`,
        result.reason
      );
    }
  }

  return processed;
}
