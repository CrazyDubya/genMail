/**
 * Document Understanding Pipeline
 *
 * This module provides deep document comprehension before chunking and extraction.
 * It solves the "Attention is All You Need" problem: extracting concepts with
 * full document context rather than processing chunks in isolation.
 *
 * Flow:
 * 1. Quick scan → detect type, structure, thesis
 * 2. Context-aware chunking → larger chunks with section awareness
 * 3. Concept extraction → extract meaning, not just names
 * 4. Concept synthesis → build hierarchy and relationships
 */

import { v4 as uuid } from 'uuid';
import type {
  RawDocument,
  DocumentContext,
  DocumentType,
  DocumentSection,
  ArgumentPoint,
  Claim,
  ExtractedConcept,
  ConceptRelationship,
  DocumentChunk,
} from '../types.js';
import type { ModelRouter } from '../models/router.js';

// =============================================================================
// DOCUMENT UNDERSTANDING (Step 1: Quick Scan)
// =============================================================================

/**
 * Perform initial document scan to extract thesis, type, and structure.
 * This provides global context for all downstream processing.
 */
export async function analyzeDocument(
  doc: RawDocument,
  router: ModelRouter
): Promise<DocumentContext> {
  const content = doc.content;
  const tokenEstimate = Math.ceil(content.length / 4);

  // For very long documents, use map-reduce summarization
  if (tokenEstimate > 8000) {
    return analyzeDocumentMapReduce(doc, router);
  }

  // For shorter documents, analyze directly
  return analyzeDocumentDirect(doc, router);
}

/**
 * Direct analysis for documents that fit in context window.
 */
async function analyzeDocumentDirect(
  doc: RawDocument,
  router: ModelRouter
): Promise<DocumentContext> {
  const prompt = `You are analyzing a document to extract deep understanding. This understanding will guide all subsequent processing.

<document>
${doc.content}
</document>

Analyze this document and provide:

1. **Document Type**: What kind of document is this?
2. **Thesis**: The main point/argument in ONE clear paragraph
3. **Summary**: A comprehensive 500-800 word summary covering all key points
4. **Argument Structure**: The logical flow of the document's argument/narrative
5. **Core Concepts**: The 5-10 most important concepts that define this document
6. **Structure**: The sections/parts of the document (detect headers, logical divisions)
7. **Claims**: Key claims made and what evidence supports them
8. **Significance**: What makes this document important or novel?

Respond with JSON:
{
  "documentType": "academic_paper|technical_doc|article|book_chapter|transcript|email_thread|report|unknown",
  "thesis": "Single paragraph main point",
  "summary": "500-800 word comprehensive summary",
  "argumentStructure": [
    {"point": "First major point", "supporting": ["detail 1", "detail 2"], "order": 1}
  ],
  "coreConcepts": ["Concept 1", "Concept 2"],
  "structure": [
    {"title": "Section name", "startOffset": 0, "endOffset": 1000, "summary": "What this section covers"}
  ],
  "claims": [
    {"statement": "Claim made", "evidence": ["Evidence 1"], "confidence": 0.9}
  ],
  "significance": "Why this document matters"
}`;

  try {
    const result = await router.generateStructured<{
      documentType: DocumentType;
      thesis: string;
      summary: string;
      argumentStructure: ArgumentPoint[];
      coreConcepts: string[];
      structure: DocumentSection[];
      claims: Claim[];
      significance: string;
    }>('claude-sonnet', prompt, { temperature: 0.3 });

    return {
      documentType: result.documentType,
      thesis: result.thesis,
      summary: result.summary,
      argumentStructure: result.argumentStructure,
      coreConcepts: result.coreConcepts,
      structure: result.structure,
      claims: result.claims,
      significance: result.significance,
    };
  } catch (error) {
    console.error('[Document Understanding] Analysis failed:', error);
    return createFallbackContext(doc);
  }
}

/**
 * Map-reduce analysis for long documents.
 * Summarizes sections first, then combines into overall understanding.
 */
async function analyzeDocumentMapReduce(
  doc: RawDocument,
  router: ModelRouter
): Promise<DocumentContext> {
  console.log('[Document Understanding] Using map-reduce for long document');

  // Step 1: Detect structure and split into sections
  const sections = detectDocumentSections(doc.content);

  // Step 2: Summarize each section (map phase)
  const sectionSummaries: Array<{ title: string; summary: string; concepts: string[] }> = [];

  for (const section of sections) {
    const sectionContent = doc.content.slice(section.startOffset, section.endOffset);

    // Skip very short sections
    if (sectionContent.length < 200) continue;

    const prompt = `Summarize this section of a document:

<section title="${section.title}">
${sectionContent.slice(0, 6000)}
</section>

Provide:
1. A 100-200 word summary of this section
2. The key concepts introduced or discussed

Respond with JSON:
{
  "summary": "Section summary",
  "concepts": ["Concept 1", "Concept 2"]
}`;

    try {
      const result = await router.generateStructured<{
        summary: string;
        concepts: string[];
      }>('gemini-flash', prompt, { temperature: 0.3 });

      sectionSummaries.push({
        title: section.title,
        summary: result.summary,
        concepts: result.concepts,
      });
    } catch {
      sectionSummaries.push({
        title: section.title,
        summary: `Section: ${section.title}`,
        concepts: [],
      });
    }
  }

  // Step 3: Combine section summaries into document understanding (reduce phase)
  const combinedSummaries = sectionSummaries
    .map((s) => `## ${s.title}\n${s.summary}\nKey concepts: ${s.concepts.join(', ')}`)
    .join('\n\n');

  const reducePrompt = `Based on these section summaries, provide overall document understanding:

<section_summaries>
${combinedSummaries}
</section_summaries>

Analyze and provide:
1. Document type
2. Main thesis (one paragraph)
3. Comprehensive summary (500-800 words)
4. Argument structure
5. Core concepts (consolidated from all sections)
6. Key claims and evidence
7. Significance

Respond with JSON:
{
  "documentType": "academic_paper|technical_doc|article|book_chapter|transcript|email_thread|report|unknown",
  "thesis": "Main thesis paragraph",
  "summary": "Comprehensive summary",
  "argumentStructure": [{"point": "string", "supporting": ["string"], "order": 1}],
  "coreConcepts": ["Concept 1"],
  "claims": [{"statement": "string", "evidence": ["string"], "confidence": 0.9}],
  "significance": "Why this matters"
}`;

  try {
    const result = await router.generateStructured<{
      documentType: DocumentType;
      thesis: string;
      summary: string;
      argumentStructure: ArgumentPoint[];
      coreConcepts: string[];
      claims: Claim[];
      significance: string;
    }>('claude-sonnet', reducePrompt, { temperature: 0.3 });

    return {
      documentType: result.documentType,
      thesis: result.thesis,
      summary: result.summary,
      argumentStructure: result.argumentStructure,
      coreConcepts: result.coreConcepts,
      structure: sections.map((s, i) => ({
        ...s,
        summary: sectionSummaries[i]?.summary,
      })),
      claims: result.claims,
      significance: result.significance,
    };
  } catch (error) {
    console.error('[Document Understanding] Reduce phase failed:', error);
    return createFallbackContext(doc);
  }
}

/**
 * Detect document sections based on headers and structural patterns.
 */
function detectDocumentSections(content: string): DocumentSection[] {
  const sections: DocumentSection[] = [];

  // Try to detect markdown-style headers
  const headerRegex = /^#{1,3}\s+(.+)$/gm;
  let lastEnd = 0;
  let match;

  while ((match = headerRegex.exec(content)) !== null) {
    if (lastEnd > 0) {
      // Close previous section
      sections[sections.length - 1].endOffset = match.index;
    }

    sections.push({
      title: match[1].trim(),
      startOffset: match.index,
      endOffset: content.length, // Will be updated
    });

    lastEnd = match.index + match[0].length;
  }

  // Try numbered sections (1., 2., etc.)
  if (sections.length < 3) {
    sections.length = 0;
    const numberedRegex = /^(\d+\.?\s+[A-Z][^\n]+)/gm;
    lastEnd = 0;

    while ((match = numberedRegex.exec(content)) !== null) {
      if (lastEnd > 0 && sections.length > 0) {
        sections[sections.length - 1].endOffset = match.index;
      }

      sections.push({
        title: match[1].trim(),
        startOffset: match.index,
        endOffset: content.length,
      });

      lastEnd = match.index + match[0].length;
    }
  }

  // Fallback: Split into roughly equal parts
  if (sections.length < 2) {
    const chunkSize = Math.ceil(content.length / 5);
    sections.length = 0;

    for (let i = 0; i < 5; i++) {
      const end = Math.min((i + 1) * chunkSize, content.length);

      // Try to find a paragraph break near the boundary
      const nearEnd = content.slice(end - 200, end + 200);
      const breakMatch = nearEnd.match(/\n\s*\n/);
      const adjustedEnd = breakMatch
        ? end - 200 + (breakMatch.index ?? 0)
        : end;

      sections.push({
        title: `Part ${i + 1}`,
        startOffset: i === 0 ? 0 : sections[i - 1].endOffset,
        endOffset: adjustedEnd,
      });
    }
  }

  return sections;
}

/**
 * Create fallback context when analysis fails.
 */
function createFallbackContext(doc: RawDocument): DocumentContext {
  // Extract first paragraph as thesis
  const firstPara = doc.content.split(/\n\s*\n/)[0]?.slice(0, 500) ?? '';

  return {
    documentType: 'unknown',
    thesis: `This document discusses: ${firstPara}...`,
    summary: doc.content.slice(0, 2000),
    argumentStructure: [],
    coreConcepts: [],
    structure: [{ title: 'Document', startOffset: 0, endOffset: doc.content.length }],
    claims: [],
    significance: 'Analysis failed - using raw content',
  };
}

// =============================================================================
// CONTEXT-AWARE CHUNKING (Step 2)
// =============================================================================

interface ChunkOptions {
  maxTokens?: number;
  overlap?: number;
}

/**
 * Chunk document with awareness of structure and larger context windows.
 */
export function chunkDocumentWithContext(
  doc: RawDocument,
  context: DocumentContext,
  options: ChunkOptions = {}
): DocumentChunk[] {
  // Use larger chunks now that we have document context
  const maxTokens = options.maxTokens ?? 2500;
  const overlap = options.overlap ?? 200;

  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;

  // If we have structure, chunk by section
  if (context.structure.length > 1) {
    for (const section of context.structure) {
      const sectionContent = doc.content.slice(section.startOffset, section.endOffset);
      const sectionChunks = chunkText(
        sectionContent,
        doc.id,
        section.startOffset,
        maxTokens,
        overlap,
        section.title,
        chunkIndex
      );

      chunks.push(...sectionChunks);
      chunkIndex += sectionChunks.length;
    }
  } else {
    // No structure detected, chunk the whole document
    const wholeDocChunks = chunkText(
      doc.content,
      doc.id,
      0,
      maxTokens,
      overlap,
      undefined,
      0
    );
    chunks.push(...wholeDocChunks);
  }

  return chunks;
}

function chunkText(
  text: string,
  docId: string,
  baseOffset: number,
  maxTokens: number,
  overlap: number,
  sectionTitle: string | undefined,
  startIndex: number
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const maxChars = maxTokens * 4;
  const overlapChars = overlap * 4;

  // Split by paragraphs
  const paragraphs = text.split(/\n\s*\n/);
  let currentChunk = '';
  let currentStart = baseOffset;
  let currentOffset = baseOffset;
  let chunkIndex = startIndex;

  for (const para of paragraphs) {
    const paraLength = para.length + 2; // +2 for paragraph break

    if (currentChunk.length + paraLength > maxChars && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        id: uuid(),
        documentId: docId as any,
        content: currentChunk.trim(),
        startOffset: currentStart,
        endOffset: currentOffset,
        tokenEstimate: Math.ceil(currentChunk.length / 4),
        sectionTitle,
        chunkIndex: chunkIndex++,
      });

      // Start new chunk with overlap
      const overlapText = currentChunk.slice(-overlapChars);
      currentChunk = overlapText + para + '\n\n';
      currentStart = currentOffset - overlapChars;
    } else {
      currentChunk += para + '\n\n';
    }

    currentOffset += paraLength;
  }

  // Save final chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      id: uuid(),
      documentId: docId as any,
      content: currentChunk.trim(),
      startOffset: currentStart,
      endOffset: currentOffset,
      tokenEstimate: Math.ceil(currentChunk.length / 4),
      sectionTitle,
      chunkIndex: chunkIndex,
    });
  }

  return chunks;
}

// =============================================================================
// CONCEPT EXTRACTION (Step 3)
// =============================================================================

/**
 * Extract concepts from chunks WITH document context.
 * This is the key improvement: each chunk knows the document's thesis.
 */
export async function extractConceptsFromChunks(
  chunks: DocumentChunk[],
  context: DocumentContext,
  router: ModelRouter
): Promise<ExtractedConcept[]> {
  const allConcepts: ExtractedConcept[] = [];

  // Process chunks in parallel batches
  const batchSize = 3;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((chunk) => extractConceptsFromChunk(chunk, context, router))
    );

    for (const concepts of results) {
      allConcepts.push(...concepts);
    }
  }

  return mergeConcepts(allConcepts);
}

/**
 * Extract concepts from a single chunk with full document context.
 */
async function extractConceptsFromChunk(
  chunk: DocumentChunk,
  context: DocumentContext,
  router: ModelRouter
): Promise<ExtractedConcept[]> {
  const prompt = `You are extracting CONCEPTS (not just entity names) from a document chunk.

DOCUMENT CONTEXT:
- Type: ${context.documentType}
- Thesis: ${context.thesis}
- Core concepts to look for: ${context.coreConcepts.join(', ')}
- Significance: ${context.significance}
${chunk.sectionTitle ? `- This chunk is from section: "${chunk.sectionTitle}"` : ''}

<chunk>
${chunk.content}
</chunk>

Extract concepts from this chunk. For each concept:
1. **Name**: The concept name
2. **Definition**: What this concept means IN THIS DOCUMENT (not a generic definition)
3. **Role**: Why this concept matters to the document's thesis
4. **Relationships**: How it connects to other concepts
5. **Details**: Specific formulas, examples, or technical details mentioned

Focus on concepts that are CENTRAL to the document's argument, not peripheral mentions.

Respond with JSON:
{
  "concepts": [
    {
      "name": "Concept Name",
      "definition": "What this means in the context of this specific document",
      "roleInDocument": "Why this matters to the thesis",
      "relationships": [
        {"targetConcept": "Other Concept", "relationshipType": "part-of|uses|enables|contrasts-with|extends|implements|requires|is-a", "description": "How they relate"}
      ],
      "details": ["Specific detail 1", "Formula or example"],
      "importance": 0.0-1.0
    }
  ]
}`;

  try {
    const result = await router.generateStructured<{
      concepts: Array<{
        name: string;
        definition: string;
        roleInDocument: string;
        relationships: ConceptRelationship[];
        details: string[];
        importance: number;
      }>;
    }>('gemini-flash', prompt, { temperature: 0.3 });

    return result.concepts.map((c) => ({
      id: uuid(),
      name: c.name,
      definition: c.definition,
      roleInDocument: c.roleInDocument,
      relationships: c.relationships,
      details: c.details,
      sourceChunks: [chunk.id],
      importance: c.importance,
    }));
  } catch (error) {
    console.error('[Concept Extraction] Failed for chunk:', error);
    return [];
  }
}

/**
 * Merge duplicate concepts from different chunks.
 */
function mergeConcepts(concepts: ExtractedConcept[]): ExtractedConcept[] {
  const merged: Map<string, ExtractedConcept> = new Map();

  for (const concept of concepts) {
    const key = concept.name.toLowerCase().trim();
    const existing = merged.get(key);

    if (existing) {
      // Merge: combine details, source chunks, take longer definition
      existing.sourceChunks.push(...concept.sourceChunks);
      existing.details = [...new Set([...existing.details, ...concept.details])];
      existing.importance = Math.max(existing.importance, concept.importance);

      if (concept.definition.length > existing.definition.length) {
        existing.definition = concept.definition;
      }

      // Merge relationships
      for (const rel of concept.relationships) {
        const existingRel = existing.relationships.find(
          (r) => r.targetConcept.toLowerCase() === rel.targetConcept.toLowerCase()
        );
        if (!existingRel) {
          existing.relationships.push(rel);
        }
      }
    } else {
      merged.set(key, { ...concept });
    }
  }

  // Sort by importance
  return Array.from(merged.values()).sort((a, b) => b.importance - a.importance);
}

// =============================================================================
// CONCEPT SYNTHESIS (Step 4)
// =============================================================================

/**
 * Synthesize concepts into a coherent hierarchy and validate relationships.
 */
export async function synthesizeConcepts(
  concepts: ExtractedConcept[],
  context: DocumentContext,
  router: ModelRouter
): Promise<{ concepts: ExtractedConcept[]; hierarchy: ConceptHierarchyResult }> {
  if (concepts.length === 0) {
    return {
      concepts: [],
      hierarchy: { roots: [], parentChild: [], crossLinks: [] },
    };
  }

  const conceptSummary = concepts
    .slice(0, 20)
    .map((c) => `- ${c.name}: ${c.definition.slice(0, 100)}...`)
    .join('\n');

  const prompt = `Given these extracted concepts from a document, build a concept hierarchy.

DOCUMENT THESIS: ${context.thesis}

EXTRACTED CONCEPTS:
${conceptSummary}

Build a hierarchy showing:
1. Which concepts are ROOT concepts (top-level ideas)
2. Which concepts are children of others (part-of, implements)
3. Which concepts have cross-cutting relationships

Respond with JSON:
{
  "roots": ["Top-level concept 1", "Top-level concept 2"],
  "parentChild": [
    {"parent": "Parent Concept", "children": ["Child 1", "Child 2"]}
  ],
  "crossLinks": [
    {"from": "Concept A", "to": "Concept B", "type": "uses|enables|contrasts-with"}
  ],
  "conceptValidation": [
    {"concept": "Concept Name", "isValid": true, "reason": "Central to thesis"}
  ]
}`;

  try {
    const result = await router.generateStructured<{
      roots: string[];
      parentChild: Array<{ parent: string; children: string[] }>;
      crossLinks: Array<{ from: string; to: string; type: string }>;
      conceptValidation: Array<{ concept: string; isValid: boolean; reason: string }>;
    }>('claude-haiku', prompt, { temperature: 0.3 });

    // Filter out invalid concepts
    const validConcepts = new Set(
      result.conceptValidation
        .filter((v) => v.isValid)
        .map((v) => v.concept.toLowerCase())
    );

    const filteredConcepts =
      validConcepts.size > 0
        ? concepts.filter((c) => validConcepts.has(c.name.toLowerCase()))
        : concepts;

    return {
      concepts: filteredConcepts,
      hierarchy: {
        roots: result.roots,
        parentChild: result.parentChild,
        crossLinks: result.crossLinks,
      },
    };
  } catch (error) {
    console.error('[Concept Synthesis] Failed:', error);
    return {
      concepts,
      hierarchy: {
        roots: concepts.slice(0, 3).map((c) => c.name),
        parentChild: [],
        crossLinks: [],
      },
    };
  }
}

interface ConceptHierarchyResult {
  roots: string[];
  parentChild: Array<{ parent: string; children: string[] }>;
  crossLinks: Array<{ from: string; to: string; type: string }>;
}

// =============================================================================
// KNOWLEDGE GENERATION FOR CHARACTERS
// =============================================================================

/**
 * Generate knowledge statements for a character based on their archetype.
 * This populates the character's "knows" array with actual document content.
 */
export function generateCharacterKnowledge(
  archetype: string,
  context: DocumentContext,
  concepts: ExtractedConcept[]
): string[] {
  const knowledge: string[] = [];

  // Everyone knows the basic thesis
  knowledge.push(context.thesis);

  // Select concepts based on archetype
  const topConcepts = concepts.slice(0, 10);

  switch (archetype) {
    case 'protagonist':
    case 'expert':
      // Deep knowledge - top concepts with details
      for (const concept of topConcepts.slice(0, 5)) {
        knowledge.push(`${concept.name}: ${concept.definition}`);
        if (concept.details.length > 0) {
          knowledge.push(`Technical detail: ${concept.details[0]}`);
        }
      }
      // Add claims they'd champion
      for (const claim of context.claims.slice(0, 2)) {
        knowledge.push(`Key finding: ${claim.statement}`);
      }
      break;

    case 'antagonist':
    case 'skeptic':
      // Knowledge focused on weaknesses and alternatives
      for (const concept of topConcepts.slice(0, 3)) {
        knowledge.push(`${concept.name}: ${concept.definition}`);
      }
      // Add contrasting relationships
      for (const concept of concepts) {
        const contrasts = concept.relationships.filter(
          (r) => r.relationshipType === 'contrasts-with'
        );
        for (const contrast of contrasts.slice(0, 2)) {
          knowledge.push(
            `Alternative approach: ${contrast.targetConcept} (${contrast.description})`
          );
        }
      }
      break;

    case 'enthusiast':
      // Surface knowledge with excitement
      for (const concept of topConcepts.slice(0, 4)) {
        knowledge.push(`${concept.name}: ${concept.definition.slice(0, 100)}`);
      }
      knowledge.push(`Significance: ${context.significance}`);
      break;

    case 'newcomer':
      // Basic knowledge, mostly thesis
      knowledge.push(`Document overview: ${context.summary.slice(0, 300)}`);
      for (const concept of topConcepts.slice(0, 2)) {
        knowledge.push(`Key concept: ${concept.name}`);
      }
      break;

    case 'insider':
      // Deep knowledge plus claims/evidence
      for (const concept of topConcepts.slice(0, 4)) {
        knowledge.push(`${concept.name}: ${concept.definition}`);
      }
      for (const claim of context.claims) {
        knowledge.push(`Claim: ${claim.statement} (Evidence: ${claim.evidence.join(', ')})`);
      }
      break;

    case 'outsider':
      // Broad but not deep
      for (const concept of topConcepts.slice(0, 3)) {
        knowledge.push(`${concept.name}: ${concept.roleInDocument}`);
      }
      knowledge.push(`Why it matters: ${context.significance}`);
      break;

    default:
      // Generic knowledge
      for (const concept of topConcepts.slice(0, 3)) {
        knowledge.push(`${concept.name}: ${concept.definition.slice(0, 100)}`);
      }
  }

  return knowledge;
}

// =============================================================================
// LEGACY COMPATIBILITY: Convert concepts to entities
// =============================================================================

import type { ExtractedEntity, Theme } from '../types.js';

/**
 * Convert new concept extraction to legacy entity format for compatibility.
 */
export function conceptsToEntities(concepts: ExtractedConcept[]): ExtractedEntity[] {
  return concepts.map((concept) => ({
    id: concept.id,
    type: 'concept' as const,
    name: concept.name,
    aliases: [],
    mentions: concept.sourceChunks.map((chunkId) => ({
      chunkId,
      context: concept.definition.slice(0, 200),
    })),
    attributes: {
      definition: concept.definition,
      roleInDocument: concept.roleInDocument,
      details: concept.details,
    },
    confidence: concept.importance,
  }));
}

/**
 * Extract themes from document context.
 */
export function extractThemesFromContext(
  context: DocumentContext,
  concepts: ExtractedConcept[]
): Theme[] {
  const themes: Theme[] = [];

  // Core concepts become themes
  for (let i = 0; i < context.coreConcepts.length; i++) {
    const conceptName = context.coreConcepts[i];
    const relatedConcept = concepts.find(
      (c) => c.name.toLowerCase().includes(conceptName.toLowerCase())
    );

    themes.push({
      id: uuid(),
      name: conceptName,
      description: relatedConcept?.definition ?? `Key theme: ${conceptName}`,
      relevantChunks: relatedConcept?.sourceChunks ?? [],
      weight: 1 - i * 0.1, // Decreasing weight
    });
  }

  // Add significance as a theme
  if (context.significance) {
    themes.push({
      id: uuid(),
      name: 'Document Significance',
      description: context.significance,
      relevantChunks: [],
      weight: 0.8,
    });
  }

  return themes;
}
