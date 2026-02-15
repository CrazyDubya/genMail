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
  ExtractedConcept,
  ConceptRelationship,
  DocumentChunk,
  DocumentId,
  Author,
  AuthorRelationship,
  ExtractedFigure,
  DocumentTension,
  TensionType,
  CharacterArchetype,
} from '../types.js';
import type { ModelRouter } from '../models/router.js';

// Import from refactored modules
export { analyzeDocument } from './document-analysis.js';

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
        documentId: docId as DocumentId,
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
      documentId: docId as DocumentId,
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

// =============================================================================
// AUTHOR/CONTRIBUTOR EXTRACTION
// =============================================================================

/**
 * Extract authors and their contributions from a document.
 * Handles academic papers with contributor footnotes, author sections, etc.
 */
export async function extractAuthors(
  doc: RawDocument,
  router: ModelRouter
): Promise<{ authors: Author[]; authorRelationships: AuthorRelationship[] }> {
  const content = doc.content;

  // Look for author-related sections in the document
  const authorSection = findAuthorSection(content);

  if (!authorSection) {
    console.log('[Understanding] No author section detected');
    return { authors: [], authorRelationships: [] };
  }

  console.log('[Understanding] Found author section, extracting...');

  const prompt = `Extract authors and their contributions from this document section.

<author_section>
${authorSection.slice(0, 4000)}
</author_section>

For academic papers, look for:
1. Author names with affiliations (often in header or footnotes)
2. Contribution footnotes (e.g., "* Equal contribution", numbered contributions)
3. "Author Contributions" sections describing who did what
4. Corresponding author markers

Respond with JSON:
{
  "authors": [
    {
      "name": "Full Name",
      "affiliation": "Institution (if found)",
      "contribution": "Specific contribution described (if found)",
      "position": 1,
      "isCorresponding": false,
      "equalContribution": false,
      "suggestedArchetype": "protagonist|expert|enthusiast|newcomer|insider"
    }
  ]
}

Archetype suggestions based on contribution:
- protagonist: Lead authors, started the effort, core vision
- expert: Deep technical contributions, designed key components
- enthusiast: Extensive experimentation, validation, iterative work
- newcomer: Support roles, learning while contributing
- insider: Infrastructure, tooling, systems work`;

  try {
    const result = await router.generateStructured<{
      authors: Array<{
        name: string;
        affiliation?: string;
        contribution?: string;
        position: number;
        isCorresponding: boolean;
        equalContribution: boolean;
        suggestedArchetype?: string;
      }>;
    }>('gemini-flash', prompt);

    const authors: Author[] = result.authors.map((a, i) => ({
      id: uuid(),
      name: a.name,
      affiliation: a.affiliation,
      contribution: a.contribution,
      authorPosition: a.position || i + 1,
      isCorresponding: a.isCorresponding || false,
      equalContribution: a.equalContribution || false,
      suggestedArchetype: mapToArchetype(a.suggestedArchetype),
    }));

    console.log(`[Understanding] Extracted ${authors.length} authors`);

    // Infer relationships between authors
    const authorRelationships = await inferAuthorRelationships(
      authors,
      content,
      router
    );

    return { authors, authorRelationships };
  } catch (error) {
    console.warn('[Understanding] Failed to extract authors:', error);
    return { authors: [], authorRelationships: [] };
  }
}

/**
 * Find the section of the document containing author information.
 */
function findAuthorSection(content: string): string | null {
  // Check for explicit "Author Contributions" section
  const authorContribMatch = content.match(
    /author\s+contributions?[:\s]*\n([\s\S]{100,2000}?)(?=\n\n|\n[A-Z][a-z]+\s|$)/i
  );
  if (authorContribMatch) {
    return authorContribMatch[0];
  }

  // Check for footnotes with contribution details (academic papers)
  const footnoteMatch = content.match(
    /(?:\*|†|‡|\d)\s*(?:equal\s+contribution|corresponding|contributed|designed|implemented)[\s\S]{0,2000}/i
  );
  if (footnoteMatch) {
    // Get more context around the footnote
    const idx = content.indexOf(footnoteMatch[0]);
    return content.slice(Math.max(0, idx - 500), idx + 2000);
  }

  // Look for author list at the beginning (first 2000 chars)
  const headerSection = content.slice(0, 2000);
  if (
    headerSection.match(/(?:authors?|by)[\s:]/i) ||
    headerSection.match(/\d{1,2}\.\s+[A-Z][a-z]+\s+[A-Z][a-z]+/)
  ) {
    return headerSection;
  }

  // Fallback: just return the first part of the document
  return content.slice(0, 1500);
}

/**
 * Map string archetype to CharacterArchetype type.
 */
function mapToArchetype(archetype?: string): CharacterArchetype | undefined {
  if (!archetype) return undefined;
  const valid: CharacterArchetype[] = [
    'protagonist',
    'antagonist',
    'skeptic',
    'enthusiast',
    'expert',
    'newcomer',
    'spammer',
    'newsletter_curator',
    'insider',
    'outsider',
  ];
  const normalized = archetype.toLowerCase().trim();
  return valid.find((v) => v === normalized);
}

/**
 * Infer relationships between authors based on position, affiliation, and contributions.
 */
export async function inferAuthorRelationships(
  authors: Author[],
  _docContent: string,
  _router: ModelRouter
): Promise<AuthorRelationship[]> {
  if (authors.length < 2) {
    return [];
  }

  const relationships: AuthorRelationship[] = [];

  // Heuristic-based relationships
  const firstAuthor = authors.find((a) => a.authorPosition === 1);
  const lastAuthor = authors.reduce((max, a) =>
    a.authorPosition > max.authorPosition ? a : max
  );

  // First and last author often have mentor-mentee relationship in academic papers
  if (firstAuthor && lastAuthor && firstAuthor.id !== lastAuthor.id) {
    relationships.push({
      author1Id: lastAuthor.id,
      author2Id: firstAuthor.id,
      relationshipType: 'mentor-mentee',
      confidence: 0.6,
      description: `${lastAuthor.name} (senior author) likely mentored ${firstAuthor.name} (first author)`,
    });
  }

  // Equal contributors
  const equalContributors = authors.filter((a) => a.equalContribution);
  for (let i = 0; i < equalContributors.length - 1; i++) {
    for (let j = i + 1; j < equalContributors.length; j++) {
      relationships.push({
        author1Id: equalContributors[i].id,
        author2Id: equalContributors[j].id,
        relationshipType: 'equal-contributor',
        confidence: 0.9,
        description: `${equalContributors[i].name} and ${equalContributors[j].name} contributed equally`,
      });
    }
  }

  // Same affiliation = collaborators
  const byAffiliation = new Map<string, Author[]>();
  for (const author of authors) {
    if (author.affiliation) {
      const key = author.affiliation.toLowerCase();
      if (!byAffiliation.has(key)) {
        byAffiliation.set(key, []);
      }
      byAffiliation.get(key)!.push(author);
    }
  }

  for (const [, affiliationAuthors] of byAffiliation) {
    if (affiliationAuthors.length >= 2) {
      for (let i = 0; i < affiliationAuthors.length - 1; i++) {
        for (let j = i + 1; j < affiliationAuthors.length; j++) {
          // Don't duplicate if already added as equal-contributor
          const exists = relationships.some(
            (r) =>
              (r.author1Id === affiliationAuthors[i].id &&
                r.author2Id === affiliationAuthors[j].id) ||
              (r.author1Id === affiliationAuthors[j].id &&
                r.author2Id === affiliationAuthors[i].id)
          );
          if (!exists) {
            relationships.push({
              author1Id: affiliationAuthors[i].id,
              author2Id: affiliationAuthors[j].id,
              relationshipType: 'collaborator',
              confidence: 0.7,
              description: `${affiliationAuthors[i].name} and ${affiliationAuthors[j].name} work at the same institution`,
            });
          }
        }
      }
    }
  }

  // Cross-institution collaborations
  const affiliations = [...byAffiliation.keys()];
  if (affiliations.length >= 2) {
    for (let i = 0; i < affiliations.length - 1; i++) {
      for (let j = i + 1; j < affiliations.length; j++) {
        const author1 = byAffiliation.get(affiliations[i])![0];
        const author2 = byAffiliation.get(affiliations[j])![0];
        relationships.push({
          author1Id: author1.id,
          author2Id: author2.id,
          relationshipType: 'cross-institution',
          confidence: 0.5,
          description: `Cross-institution collaboration between ${affiliations[i]} and ${affiliations[j]}`,
        });
      }
    }
  }

  console.log(`[Understanding] Inferred ${relationships.length} author relationships`);
  return relationships;
}

// =============================================================================
// FIGURE/TABLE EXTRACTION
// =============================================================================

/**
 * Extract figures and tables from document chunks with their key findings.
 */
export async function extractFiguresAndTables(
  chunks: DocumentChunk[],
  context: DocumentContext,
  router: ModelRouter
): Promise<ExtractedFigure[]> {
  const figures: ExtractedFigure[] = [];

  // Find chunks that contain table or figure references
  const chunksWithFigures = chunks.filter((chunk) =>
    /(?:table|figure|fig\.)\s*\d+/i.test(chunk.content)
  );

  if (chunksWithFigures.length === 0) {
    console.log('[Understanding] No figures/tables detected');
    return [];
  }

  console.log(
    `[Understanding] Found ${chunksWithFigures.length} chunks with figures/tables`
  );

  // Process in batches of 3
  for (let i = 0; i < chunksWithFigures.length; i += 3) {
    const batch = chunksWithFigures.slice(i, i + 3);
    const batchResults = await Promise.all(
      batch.map((chunk) => extractFiguresFromChunk(chunk, context, router))
    );
    for (const result of batchResults) {
      figures.push(...result);
    }
  }

  // Deduplicate by reference
  const seen = new Set<string>();
  const uniqueFigures = figures.filter((f) => {
    if (seen.has(f.reference)) return false;
    seen.add(f.reference);
    return true;
  });

  console.log(`[Understanding] Extracted ${uniqueFigures.length} unique figures/tables`);
  return uniqueFigures;
}

/**
 * Extract figure/table data from a single chunk.
 */
async function extractFiguresFromChunk(
  chunk: DocumentChunk,
  context: DocumentContext,
  router: ModelRouter
): Promise<ExtractedFigure[]> {
  const prompt = `Extract key results from any tables or figures in this text chunk.

Document context:
- Thesis: ${context.thesis.slice(0, 200)}
- Core concepts: ${context.coreConcepts.slice(0, 5).join(', ')}

<chunk>
${chunk.content}
</chunk>

Look for:
1. Table/figure references (e.g., "Table 2", "Figure 3")
2. Captions explaining what the table/figure shows
3. Key quantitative findings (numbers, percentages, comparisons)
4. Performance metrics, results, or data points

Respond with JSON:
{
  "figures": [
    {
      "type": "table|figure|chart|diagram",
      "reference": "Table 2",
      "caption": "BLEU scores on WMT 2014...",
      "keyFindings": ["Model achieves 28.4 BLEU", "2.0 improvement over previous best"],
      "claims": [
        {
          "statement": "Transformer outperforms all previous models",
          "metric": "BLEU",
          "value": "28.4",
          "comparison": "vs 26.4 baseline",
          "source": "Table 2"
        }
      ]
    }
  ]
}

If no tables/figures are found, return {"figures": []}`;

  try {
    const result = await router.generateStructured<{
      figures: Array<{
        type: string;
        reference: string;
        caption: string;
        keyFindings: string[];
        claims: Array<{
          statement: string;
          metric: string;
          value: string;
          comparison?: string;
          source: string;
        }>;
      }>;
    }>('gemini-flash', prompt);

    return result.figures.map((f) => ({
      id: uuid(),
      type: f.type as ExtractedFigure['type'],
      caption: f.caption,
      reference: f.reference,
      keyFindings: f.keyFindings,
      quantitativeClaims: f.claims.map((c) => ({
        statement: c.statement,
        metric: c.metric,
        value: c.value,
        comparison: c.comparison,
        source: c.source,
      })),
      sourceChunkId: chunk.id,
    }));
  } catch (error) {
    console.warn('[Understanding] Failed to extract figures from chunk:', error);
    return [];
  }
}

// =============================================================================
// DOCUMENT TENSION DETECTION
// =============================================================================

/**
 * Detect tensions from document structure and content.
 * Finds methodology debates, claim controversies, and comparison points.
 */
export async function detectDocumentTensions(
  context: DocumentContext,
  chunks: DocumentChunk[],
  router: ModelRouter
): Promise<DocumentTension[]> {
  // Find chunks that might contain tensions
  const relatedWorkChunks = chunks.filter(
    (c) =>
      c.sectionTitle?.toLowerCase().includes('related') ||
      c.sectionTitle?.toLowerCase().includes('background') ||
      c.content.toLowerCase().includes('previous work') ||
      c.content.toLowerCase().includes('prior work') ||
      c.content.match(/unlike\s+\w+,?\s+we/i) ||
      c.content.match(/in\s+contrast\s+to/i)
  );

  const limitationsChunks = chunks.filter(
    (c) =>
      c.sectionTitle?.toLowerCase().includes('limitation') ||
      c.sectionTitle?.toLowerCase().includes('future') ||
      c.sectionTitle?.toLowerCase().includes('conclusion') ||
      c.content.toLowerCase().includes('limitation') ||
      c.content.toLowerCase().includes('future work')
  );

  const relevantChunks = [...relatedWorkChunks, ...limitationsChunks].slice(0, 5);

  if (relevantChunks.length === 0) {
    console.log('[Understanding] No tension-relevant sections found');
    return [];
  }

  const chunkContent = relevantChunks
    .map((c) => `[${c.sectionTitle || 'Section'}]\n${c.content}`)
    .join('\n\n---\n\n');

  const prompt = `Analyze this document for sources of tension, debate, or controversy.

Document thesis: ${context.thesis}
Core concepts: ${context.coreConcepts.join(', ')}

<relevant_sections>
${chunkContent.slice(0, 6000)}
</relevant_sections>

Identify tensions:
1. **Methodology debates**: This approach vs alternatives (e.g., "Unlike RNNs, we use attention")
2. **Claim controversies**: Bold claims that might be disputed
3. **Comparison points**: Where this work differs from prior work
4. **Acknowledged limitations**: Weaknesses that skeptics might highlight
5. **Future directions**: Open questions that could spark discussion

Respond with JSON:
{
  "tensions": [
    {
      "type": "conflict|mystery|competition|revelation|opportunity",
      "description": "Brief description of the tension",
      "source": "methodology_comparison|result_claim|related_work|limitation|future_work",
      "involvedConcepts": ["concept1", "concept2"],
      "intensity": 0.7,
      "evidence": "Quote or paraphrase from the document",
      "scope": "internal|external"
    }
  ]
}

Types:
- conflict: Direct opposition between approaches
- mystery: Unexplained phenomenon or open question
- competition: Competing to be best at something
- revelation: Discovery that changes understanding
- opportunity: Potential for improvement or extension

Scope:
- internal: Tension within this document/work
- external: Tension with prior work or broader field`;

  try {
    const result = await router.generateStructured<{
      tensions: Array<{
        type: string;
        description: string;
        source: string;
        involvedConcepts: string[];
        intensity: number;
        evidence: string;
        scope: string;
      }>;
    }>('claude-haiku', prompt);

    const tensions: DocumentTension[] = result.tensions.map((t) => ({
      id: uuid(),
      type: t.type as TensionType,
      description: t.description,
      source: t.source as DocumentTension['source'],
      involvedConcepts: t.involvedConcepts,
      intensity: Math.min(1, Math.max(0, t.intensity)),
      evidence: t.evidence,
      scope: t.scope as 'internal' | 'external',
    }));

    console.log(`[Understanding] Detected ${tensions.length} document tensions`);
    return tensions;
  } catch (error) {
    console.warn('[Understanding] Failed to detect tensions:', error);
    return [];
  }
}
