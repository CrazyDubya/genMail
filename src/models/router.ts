/**
 * ModelRouter - Central hub for all LLM interactions
 *
 * All model calls go through here. Character voice binding is enforced here.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  ModelIdentifier,
  ModelConfig,
  VoiceProfile,
  CharacterId,
} from '../types.js';

export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  stopSequences?: string[];
}

export interface CharacterVoiceBinding {
  characterId: CharacterId;
  modelId: ModelIdentifier;
  voiceProfile: VoiceProfile;
}

export interface GenerationContext {
  threadSubject?: string;
  previousMessages?: string[];
  relationships?: string;
  emotionalState?: string;
  characterKnowledge?: string[];
}

interface ModelClient {
  generate(prompt: string, options: GenerationOptions): Promise<string>;
}

// =============================================================================
// MODEL CLIENTS
// =============================================================================

class ClaudeClient implements ModelClient {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: 'opus' | 'sonnet' | 'haiku') {
    this.client = new Anthropic({ apiKey });
    const modelMap = {
      opus: 'claude-opus-4-5-20251101',
      sonnet: 'claude-sonnet-4-5-20250929',
      haiku: 'claude-haiku-4-5-20251001',
    };
    this.model = modelMap[model];
  }

  async generate(prompt: string, options: GenerationOptions): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens ?? 2048,
      messages: [{ role: 'user', content: prompt }],
      system: options.systemPrompt,
      temperature: options.temperature ?? 0.7,
      stop_sequences: options.stopSequences,
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude');
    }
    return textBlock.text;
  }
}

class OpenAIClient implements ModelClient {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(prompt: string, options: GenerationOptions): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          ...(options.systemPrompt
            ? [{ role: 'system', content: options.systemPrompt }]
            : []),
          { role: 'user', content: prompt },
        ],
        max_tokens: options.maxTokens ?? 2048,
        temperature: options.temperature ?? 0.7,
        stop: options.stopSequences,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0].message.content;
  }
}

class GeminiClient implements ModelClient {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gemini-1.5-flash') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(prompt: string, options: GenerationOptions): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: options.systemPrompt
          ? { parts: [{ text: options.systemPrompt }] }
          : undefined,
        generationConfig: {
          maxOutputTokens: options.maxTokens ?? 2048,
          temperature: options.temperature ?? 0.7,
          stopSequences: options.stopSequences,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${error}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    return data.candidates[0].content.parts[0].text;
  }
}

class GrokClient implements ModelClient {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'grok-beta') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(prompt: string, options: GenerationOptions): Promise<string> {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          ...(options.systemPrompt
            ? [{ role: 'system', content: options.systemPrompt }]
            : []),
          { role: 'user', content: prompt },
        ],
        max_tokens: options.maxTokens ?? 2048,
        temperature: options.temperature ?? 0.8,
        stop: options.stopSequences,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Grok API error: ${error}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0].message.content;
  }
}

class OpenRouterClient implements ModelClient {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'mistralai/mistral-7b-instruct') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(prompt: string, options: GenerationOptions): Promise<string> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://emailverse.app',
        'X-Title': 'EmailVerse',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          ...(options.systemPrompt
            ? [{ role: 'system', content: options.systemPrompt }]
            : []),
          { role: 'user', content: prompt },
        ],
        max_tokens: options.maxTokens ?? 2048,
        temperature: options.temperature ?? 0.7,
        stop: options.stopSequences,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${error}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0].message.content;
  }
}

// =============================================================================
// MODEL ROUTER
// =============================================================================

export class ModelRouter {
  private clients: Map<ModelIdentifier, ModelClient> = new Map();
  private characterBindings: Map<string, CharacterVoiceBinding> = new Map();
  private callCounts: Map<ModelIdentifier, number> = new Map();

  constructor(config: ModelConfig) {
    // Initialize all clients
    if (config.anthropic.apiKey) {
      this.clients.set('claude-opus', new ClaudeClient(config.anthropic.apiKey, 'opus'));
      this.clients.set(
        'claude-sonnet',
        new ClaudeClient(config.anthropic.apiKey, 'sonnet')
      );
      this.clients.set('claude-haiku', new ClaudeClient(config.anthropic.apiKey, 'haiku'));
    }
    if (config.openai.apiKey) {
      this.clients.set('gpt-4o-mini', new OpenAIClient(config.openai.apiKey));
    }
    if (config.google.apiKey) {
      this.clients.set('gemini-flash', new GeminiClient(config.google.apiKey));
    }
    if (config.xai.apiKey) {
      this.clients.set('grok-fast', new GrokClient(config.xai.apiKey));
    }
    if (config.openrouter.apiKey) {
      this.clients.set(
        'openrouter-cheap',
        new OpenRouterClient(config.openrouter.apiKey, config.openrouter.defaultModel)
      );
    }

    // Initialize call counts
    for (const modelId of this.clients.keys()) {
      this.callCounts.set(modelId, 0);
    }
  }

  /**
   * Bind a character to a specific model.
   */
  bindCharacter(
    characterId: CharacterId,
    modelId: ModelIdentifier,
    voiceProfile: VoiceProfile
  ): void {
    this.characterBindings.set(characterId, {
      characterId,
      modelId,
      voiceProfile,
    });
  }

  /**
   * Get the model bound to a character.
   */
  getCharacterBinding(characterId: CharacterId): CharacterVoiceBinding | undefined {
    return this.characterBindings.get(characterId);
  }

  /**
   * Generate content directly using a specific model.
   */
  async generate(
    modelId: ModelIdentifier,
    prompt: string,
    options: GenerationOptions = {}
  ): Promise<string> {
    const client = this.clients.get(modelId);
    if (!client) {
      // Try fallback
      const fallback = this.getFallback(modelId);
      if (fallback) {
        console.warn(`Model ${modelId} not available, falling back to ${fallback}`);
        return this.generate(fallback, prompt, options);
      }
      throw new Error(`Unknown model: ${modelId}`);
    }

    this.incrementCallCount(modelId);

    try {
      return await this.withRetry(() => client.generate(prompt, options), modelId);
    } catch (error) {
      const fallback = this.getFallback(modelId);
      if (fallback) {
        console.warn(`Falling back from ${modelId} to ${fallback}`);
        return this.generate(fallback, prompt, options);
      }
      throw error;
    }
  }

  /**
   * Generate content as a specific character.
   */
  async generateAsCharacter(
    characterId: CharacterId,
    prompt: string,
    context: GenerationContext = {}
  ): Promise<string> {
    const binding = this.characterBindings.get(characterId);
    if (!binding) {
      throw new Error(`No voice binding for character: ${characterId}`);
    }

    const fullPrompt = this.buildCharacterPrompt(binding.voiceProfile, prompt, context);

    return this.generate(binding.modelId, fullPrompt, {
      temperature: 0.75,
    });
  }

  /**
   * Generate with structured output (JSON).
   */
  async generateStructured<T>(
    modelId: ModelIdentifier,
    prompt: string,
    options: GenerationOptions = {}
  ): Promise<T> {
    const structuredPrompt = `${prompt}

IMPORTANT: Respond with valid JSON only. No markdown, no explanation, just the JSON object.`;

    const response = await this.generate(modelId, structuredPrompt, options);

    // Clean up response
    let cleaned = response.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }

    return JSON.parse(cleaned.trim()) as T;
  }

  /**
   * Get call counts for monitoring.
   */
  getCallCounts(): Record<ModelIdentifier, number> {
    return Object.fromEntries(this.callCounts) as Record<ModelIdentifier, number>;
  }

  /**
   * Reset call counts.
   */
  resetCallCounts(): void {
    for (const modelId of this.clients.keys()) {
      this.callCounts.set(modelId, 0);
    }
  }

  /**
   * Check which models are available.
   */
  getAvailableModels(): ModelIdentifier[] {
    return Array.from(this.clients.keys());
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private buildCharacterPrompt(
    voice: VoiceProfile,
    prompt: string,
    context: GenerationContext
  ): string {
    return `You are writing as a character with this voice profile:

VOICE PROFILE:
- Formality: ${voice.formality}/1 (0=very casual, 1=very formal)
- Verbosity: ${voice.verbosity}/1 (0=terse, 1=verbose)
- Characteristic vocabulary: ${voice.vocabulary.join(', ')}
- Typical greetings: ${voice.greetingPatterns.join(', ')}
- Typical sign-offs: ${voice.signoffPatterns.join(', ')}
- Quirks: ${voice.quirks.join('; ')}

EXAMPLE OUTPUTS FROM THIS CHARACTER:
${voice.sampleOutputs.map((s, i) => `--- Example ${i + 1} ---\n${s}`).join('\n\n')}

${context.threadSubject ? `THREAD CONTEXT:\nSubject: ${context.threadSubject}` : ''}
${context.previousMessages?.length ? `Previous messages:\n${context.previousMessages.join('\n---\n')}` : ''}
${context.relationships ? `Relationship to recipients: ${context.relationships}` : ''}
${context.emotionalState ? `Current emotional state: ${context.emotionalState}` : ''}
${context.characterKnowledge?.length ? `What you know:\n- ${context.characterKnowledge.join('\n- ')}` : ''}

YOUR TASK:
${prompt}

Write ONLY the email content. Match the voice profile exactly. Do not include headers or metadata.`;
  }

  private incrementCallCount(modelId: ModelIdentifier): void {
    const current = this.callCounts.get(modelId) ?? 0;
    this.callCounts.set(modelId, current + 1);
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    modelId: ModelIdentifier,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (this.isRateLimitError(error)) {
          const backoff = this.getBackoffMs(modelId, i);
          console.warn(`Rate limited on ${modelId}, waiting ${backoff}ms`);
          await this.sleep(backoff);
          continue;
        }

        throw error;
      }
    }

    throw lastError ?? new Error('Max retries exceeded');
  }

  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      return (
        error.message.includes('rate') ||
        error.message.includes('429') ||
        error.message.includes('quota')
      );
    }
    return false;
  }

  private getBackoffMs(modelId: ModelIdentifier, attempt: number): number {
    const baseMs: Record<ModelIdentifier, number> = {
      'claude-opus': 5000,
      'claude-sonnet': 3000,
      'claude-haiku': 2000,
      'gpt-4o-mini': 2000,
      'gemini-flash': 1000,
      'grok-fast': 2000,
      'openrouter-cheap': 1000,
    };

    return (baseMs[modelId] ?? 2000) * Math.pow(2, attempt);
  }

  private getFallback(modelId: ModelIdentifier): ModelIdentifier | undefined {
    const fallbacks: Partial<Record<ModelIdentifier, ModelIdentifier>> = {
      'claude-opus': 'claude-sonnet',
      'claude-sonnet': 'claude-haiku',
      'claude-haiku': 'gpt-4o-mini',
      'gpt-4o-mini': 'gemini-flash',
      'gemini-flash': 'openrouter-cheap',
      'grok-fast': 'gpt-4o-mini',
    };

    return fallbacks[modelId];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createModelRouter(config?: Partial<ModelConfig>): ModelRouter {
  const fullConfig: ModelConfig = {
    anthropic: { apiKey: config?.anthropic?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '' },
    openai: { apiKey: config?.openai?.apiKey ?? process.env.OPENAI_API_KEY ?? '' },
    google: { apiKey: config?.google?.apiKey ?? process.env.GOOGLE_AI_API_KEY ?? '' },
    xai: { apiKey: config?.xai?.apiKey ?? process.env.XAI_API_KEY ?? '' },
    openrouter: {
      apiKey: config?.openrouter?.apiKey ?? process.env.OPENROUTER_API_KEY ?? '',
      defaultModel:
        config?.openrouter?.defaultModel ?? 'mistralai/mistral-7b-instruct',
    },
  };

  return new ModelRouter(fullConfig);
}
