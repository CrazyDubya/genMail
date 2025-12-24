/**
 * Embedding Client for Semantic Search
 *
 * Uses OpenAI's text-embedding-3-small model for generating embeddings.
 * Cost: ~$0.02 per 1M tokens (~$0.002 per typical document)
 *
 * Used for:
 * - Document chunk embeddings for RAG retrieval
 * - Semantic thread routing (vs keyword matching)
 * - Entity/concept deduplication
 */

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  model: string;
  dimensions: number;
  tokenCount: number;
}

export interface EmbeddingBatchResult {
  embeddings: EmbeddingResult[];
  totalTokens: number;
  model: string;
}

export interface EmbeddingClientConfig {
  apiKey: string;
  model?: string;
  dimensions?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

// OpenAI API response types
interface OpenAIEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Client for generating text embeddings via OpenAI's API.
 */
export class EmbeddingClient {
  private apiKey: string;
  private model: string;
  private dimensions: number;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(config: EmbeddingClientConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'text-embedding-3-small';
    this.dimensions = config.dimensions ?? 1536;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 1000;
  }

  /**
   * Generate embedding for a single text string.
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const result = await this.embedBatch([text]);
    return result.embeddings[0];
  }

  /**
   * Generate embeddings for multiple texts in a single API call.
   * OpenAI supports up to 2048 texts per batch.
   *
   * @param texts - Array of strings to embed
   * @param batchSize - Max texts per API call (default 100 for safety)
   */
  async embedBatch(
    texts: string[],
    batchSize: number = 100
  ): Promise<EmbeddingBatchResult> {
    if (texts.length === 0) {
      return { embeddings: [], totalTokens: 0, model: this.model };
    }

    const allEmbeddings: EmbeddingResult[] = [];
    let totalTokens = 0;

    // Process in batches
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const result = await this.callOpenAI(batch);

      for (let j = 0; j < result.data.length; j++) {
        allEmbeddings.push({
          text: batch[j],
          embedding: result.data[j].embedding,
          model: result.model,
          dimensions: result.data[j].embedding.length,
          tokenCount: Math.ceil(result.usage.prompt_tokens / batch.length), // Approximate per-text tokens
        });
      }

      totalTokens += result.usage.total_tokens;

      // Rate limiting: small delay between batches
      if (i + batchSize < texts.length) {
        await this.delay(100);
      }
    }

    return {
      embeddings: allEmbeddings,
      totalTokens,
      model: this.model,
    };
  }

  /**
   * Make API call to OpenAI embeddings endpoint with retry logic.
   */
  private async callOpenAI(texts: string[]): Promise<OpenAIEmbeddingResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            input: texts,
            dimensions: this.dimensions,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();

          // Rate limiting - wait and retry
          if (response.status === 429) {
            const retryAfter = parseInt(
              response.headers.get('retry-after') ?? '5',
              10
            );
            console.warn(
              `[Embeddings] Rate limited, waiting ${retryAfter}s...`
            );
            await this.delay(retryAfter * 1000);
            continue;
          }

          throw new Error(
            `OpenAI Embeddings API error ${response.status}: ${errorBody}`
          );
        }

        return (await response.json()) as OpenAIEmbeddingResponse;
      } catch (error) {
        lastError = error as Error;
        console.warn(
          `[Embeddings] Attempt ${attempt + 1}/${this.maxRetries} failed:`,
          lastError.message
        );

        if (attempt < this.maxRetries - 1) {
          await this.delay(this.retryDelayMs * (attempt + 1)); // Exponential backoff
        }
      }
    }

    throw new Error(
      `[Embeddings] All ${this.maxRetries} attempts failed: ${lastError?.message}`
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Estimate token count for text (rough approximation).
   * OpenAI uses ~4 chars per token on average.
   */
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate cost for embedding texts.
   * text-embedding-3-small: $0.02 per 1M tokens
   */
  static estimateCost(texts: string[]): number {
    const totalChars = texts.reduce((sum, t) => sum + t.length, 0);
    const estimatedTokens = Math.ceil(totalChars / 4);
    return (estimatedTokens / 1_000_000) * 0.02;
  }
}

/**
 * Create an embedding client using environment configuration.
 */
export function createEmbeddingClient(
  config?: Partial<EmbeddingClientConfig>
): EmbeddingClient {
  const apiKey = config?.apiKey ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      '[Embeddings] OPENAI_API_KEY is required for embedding generation'
    );
  }

  return new EmbeddingClient({
    apiKey,
    model: config?.model ?? 'text-embedding-3-small',
    dimensions: config?.dimensions ?? 1536,
    maxRetries: config?.maxRetries ?? 3,
    retryDelayMs: config?.retryDelayMs ?? 1000,
  });
}
