/**
 * Document Analysis Module
 *
 * Core document understanding - extracts thesis, type, structure, and overall context.
 * Provides global context for all downstream processing.
 */

import type {
  RawDocument,
  DocumentContext,
  DocumentType,
  DocumentSection,
  ArgumentPoint,
  Claim,
} from '../types.js';
import type { ModelRouter } from '../models/router.js';

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
export function detectDocumentSections(content: string): DocumentSection[] {
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
export function createFallbackContext(doc: RawDocument): DocumentContext {
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
