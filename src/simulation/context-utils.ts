/**
 * Context Utilities
 *
 * Utilities for merging and managing document context.
 */

import type { ProcessedDocument, DocumentContext } from '../types.js';

/**
 * Merge context from all documents in the universe.
 *
 * Previously we only used documents[0]?.context, ignoring all other documents.
 * This function combines thesis, concepts, claims, and summaries from ALL docs.
 */
export function getMergedDocumentContext(
  documents: ProcessedDocument[]
): DocumentContext | undefined {
  if (documents.length === 0) return undefined;
  if (documents.length === 1) return documents[0].context;

  // Merge thesis from all docs
  const theses = documents.map(d => d.context?.thesis).filter(Boolean) as string[];
  const mergedThesis =
    theses.length === 1 ? theses[0] : theses.join(' Additionally, ');

  // Combine core concepts from all docs (deduplicated)
  const allConcepts = documents.flatMap(d => d.context?.coreConcepts ?? []);
  const uniqueConcepts = [...new Set(allConcepts)];

  // Combine claims from all docs
  const allClaims = documents.flatMap(d => d.context?.claims ?? []);

  // Combine argument structures from all docs
  const allArguments = documents.flatMap(d => d.context?.argumentStructure ?? []);

  // Combine summaries
  const allSummaries = documents
    .map(d => d.context?.summary ?? '')
    .filter(s => s.length > 0);
  const mergedSummary = allSummaries.join('\n\n--- From another document ---\n\n');

  // Combine significance
  const allSignificance = documents
    .map(d => d.context?.significance ?? '')
    .filter(s => s.length > 0);
  const mergedSignificance = allSignificance.join(' Furthermore, ');

  // Use first document as base for structure fields
  const baseContext = documents[0].context;
  if (!baseContext) return undefined;

  return {
    ...baseContext,
    thesis: mergedThesis,
    coreConcepts: uniqueConcepts,
    claims: allClaims,
    argumentStructure: allArguments,
    summary: mergedSummary,
    significance: mergedSignificance,
  };
}

/**
 * Get all rich concepts from all documents.
 */
export function getAllDocumentConcepts(documents: ProcessedDocument[]) {
  return documents.flatMap(d => d.concepts ?? []);
}
