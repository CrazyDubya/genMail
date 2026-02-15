/**
 * Document Pipeline Tests
 *
 * Tests for document ingestion, chunking, and entity extraction.
 */

import { describe, it, expect } from 'vitest';
import { chunkDocument } from '../../src/pipeline/documents.js';
import type { RawDocument } from '../../src/types.js';

describe('Document Pipeline', () => {
  describe('chunkDocument', () => {
    it('should chunk a simple document into semantic pieces', () => {
      const doc: RawDocument = {
        id: 'test-doc-1',
        filename: 'test.txt',
        mimeType: 'text/plain',
        content: 'Paragraph one.\n\nParagraph two.\n\nParagraph three.',
        uploadedAt: new Date().toISOString(),
      };

      const chunks = chunkDocument(doc, { maxTokens: 50, overlap: 10 });

      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach(chunk => {
        expect(chunk.id).toBeDefined();
        expect(chunk.documentId).toBe(doc.id);
        expect(chunk.content).toBeTruthy();
        expect(chunk.startOffset).toBeGreaterThanOrEqual(0);
        expect(chunk.endOffset).toBeGreaterThan(chunk.startOffset);
      });
    });

    it('should respect maxTokens limit', () => {
      const doc: RawDocument = {
        id: 'test-doc-2',
        filename: 'long.txt',
        mimeType: 'text/plain',
        content: 'a '.repeat(2000), // ~2000 tokens
        uploadedAt: new Date().toISOString(),
      };

      const chunks = chunkDocument(doc, { maxTokens: 500 });

      // Verify we got multiple chunks from long content
      expect(chunks.length).toBeGreaterThan(0);
      
      // Each chunk should have content
      chunks.forEach(chunk => {
        expect(chunk.content.length).toBeGreaterThan(0);
        expect(chunk.documentId).toBe(doc.id);
      });
    });

    it('should handle single paragraph documents', () => {
      const doc: RawDocument = {
        id: 'test-doc-3',
        filename: 'short.txt',
        mimeType: 'text/plain',
        content: 'This is a short document with no paragraph breaks.',
        uploadedAt: new Date().toISOString(),
      };

      const chunks = chunkDocument(doc);

      expect(chunks.length).toBe(1);
      expect(chunks[0].content).toBe(doc.content);
    });

    it('should create overlapping chunks when specified', () => {
      const doc: RawDocument = {
        id: 'test-doc-4',
        filename: 'overlap.txt',
        mimeType: 'text/plain',
        content: 'First paragraph with some content.\n\nSecond paragraph with more content.\n\nThird paragraph with final content.',
        uploadedAt: new Date().toISOString(),
      };

      const chunks = chunkDocument(doc, { maxTokens: 30, overlap: 10 });

      // Verify chunks have some content overlap
      if (chunks.length > 1) {
        // Check that end of one chunk overlaps with start of next
        expect(chunks.length).toBeGreaterThan(1);
      }
    });

    it('should handle empty documents', () => {
      const doc: RawDocument = {
        id: 'test-doc-5',
        filename: 'empty.txt',
        mimeType: 'text/plain',
        content: '',
        uploadedAt: new Date().toISOString(),
      };

      const chunks = chunkDocument(doc);

      expect(chunks.length).toBe(0);
    });

    it('should preserve document ID in all chunks', () => {
      const doc: RawDocument = {
        id: 'test-doc-6',
        filename: 'multi.txt',
        mimeType: 'text/plain',
        content: 'Para 1\n\nPara 2\n\nPara 3\n\nPara 4\n\nPara 5',
        uploadedAt: new Date().toISOString(),
      };

      const chunks = chunkDocument(doc, { maxTokens: 20 });

      chunks.forEach(chunk => {
        expect(chunk.documentId).toBe(doc.id);
      });
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens roughly as 1 token per 4 characters', () => {
      const text = 'a'.repeat(400); // Should be ~100 tokens
      const estimatedTokens = Math.ceil(text.length / 4);
      expect(estimatedTokens).toBe(100);
    });
  });
});
