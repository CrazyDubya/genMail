/**
 * Vector Math Utilities for Semantic Search
 *
 * Used for:
 * - Cosine similarity between embeddings
 * - k-Nearest Neighbors search
 * - Embedding normalization
 */

/**
 * Calculate cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite).
 *
 * For normalized embeddings (OpenAI's are L2-normalized), this is just the dot product.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`
    );
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Calculate dot product between two vectors.
 * For L2-normalized vectors, this equals cosine similarity.
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`
    );
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result += a[i] * b[i];
  }
  return result;
}

/**
 * L2 normalize a vector (unit length).
 * OpenAI embeddings are already normalized, but this is useful for custom embeddings.
 */
export function normalize(v: number[]): number[] {
  let norm = 0;
  for (let i = 0; i < v.length; i++) {
    norm += v[i] * v[i];
  }
  norm = Math.sqrt(norm);

  if (norm === 0) return v;

  return v.map((x) => x / norm);
}

/**
 * Calculate L2 (Euclidean) norm of a vector.
 */
export function l2Norm(v: number[]): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
}

/**
 * Calculate Euclidean distance between two vectors.
 * Smaller values = more similar.
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`
    );
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export interface VectorCandidate {
  id: string;
  embedding: number[];
}

export interface SimilarityResult {
  id: string;
  similarity: number;
}

/**
 * Find k nearest neighbors to a query vector using cosine similarity.
 * Returns results sorted by similarity (highest first).
 *
 * @param query - The query embedding
 * @param candidates - Array of candidates with embeddings
 * @param k - Number of results to return
 * @param threshold - Optional minimum similarity threshold (0-1)
 */
export function kNearestNeighbors(
  query: number[],
  candidates: VectorCandidate[],
  k: number,
  threshold: number = 0
): SimilarityResult[] {
  const similarities: SimilarityResult[] = [];

  for (const candidate of candidates) {
    const similarity = cosineSimilarity(query, candidate.embedding);
    if (similarity >= threshold) {
      similarities.push({
        id: candidate.id,
        similarity,
      });
    }
  }

  // Sort by similarity descending and take top k
  similarities.sort((a, b) => b.similarity - a.similarity);
  return similarities.slice(0, k);
}

/**
 * Find all vectors within a similarity threshold.
 * Useful for clustering or deduplication.
 *
 * @param query - The query embedding
 * @param candidates - Array of candidates with embeddings
 * @param threshold - Minimum similarity (0-1)
 */
export function findSimilar(
  query: number[],
  candidates: VectorCandidate[],
  threshold: number
): SimilarityResult[] {
  const results: SimilarityResult[] = [];

  for (const candidate of candidates) {
    const similarity = cosineSimilarity(query, candidate.embedding);
    if (similarity >= threshold) {
      results.push({
        id: candidate.id,
        similarity,
      });
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Average multiple vectors into a single centroid.
 * Useful for creating cluster centroids or topic embeddings.
 */
export function averageVectors(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    throw new Error('Cannot average empty vector list');
  }

  const dimensions = vectors[0].length;
  const result = new Array<number>(dimensions).fill(0);

  for (const vec of vectors) {
    if (vec.length !== dimensions) {
      throw new Error('All vectors must have same dimensions');
    }
    for (let i = 0; i < dimensions; i++) {
      result[i] += vec[i];
    }
  }

  for (let i = 0; i < dimensions; i++) {
    result[i] /= vectors.length;
  }

  return result;
}
