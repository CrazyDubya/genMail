/**
 * ModelRouter - Central hub for all LLM interactions
 * 
 * This is the most critical piece of infrastructure.
 * All model calls go through here. Character voice binding is enforced here.
 */

import Anthropic from '@anthropic-ai/sdk';

// =============================================================================
// TYPES
// =============================================================================

export type ModelIdentifier = 
  | 'claude-opus'
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'gpt-5.2-nano'
  | 'gemini-3-flash'
  | 'grok-3-fast'
  | 'openrouter-cheap';

export interface ModelConfig {
  anthropic: { apiKey: string };
  openai: { apiKey: string };
  google: { apiKey: string };
  xai: { apiKey: string };
  openrouter: { apiKey: string; defaultModel: string };
}

export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  stopSequences?: string[];
}

export interface CharacterVoiceBinding {
  characterId: string;
  modelId: ModelIdentifier;
  voiceProfile: VoiceProfile;
}

export interface VoiceProfile {
  formality: number;
  verbosity: number;
  vocabulary: string[];
  greetingPatterns: string[];
  signoffPatterns: string[];
  quirks: string[];
  sampleOutputs: string[];
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

    const textBlock = response.content.find(block => block.type === 'text');
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
    // Note: gpt-5.2-nano is hypothetical - use appropriate model string
    this.model = model;
  }

  async generate(prompt: string, options: GenerationOptions): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
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

    const data = await response.json();
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
        systemInstruction: options.systemPrompt ? { parts: [{ text: options.systemPrompt }] } : undefined,
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

    const data = await response.json();
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
    // xAI uses OpenAI-compatible API
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
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

    const data = await response.json();
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
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://emailverse.app',
        'X-Title': 'EmailVerse',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
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

    const data = await response.json();
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
    this.clients.set('claude-opus', new ClaudeClient(config.anthropic.apiKey, 'opus'));
    this.clients.set('claude-sonnet', new ClaudeClient(config.anthropic.apiKey, 'sonnet'));
    this.clients.set('claude-haiku', new ClaudeClient(config.anthropic.apiKey, 'haiku'));
    this.clients.set('gpt-5.2-nano', new OpenAIClient(config.openai.apiKey));
    this.clients.set('gemini-3-flash', new GeminiClient(config.google.apiKey));
    this.clients.set('grok-3-fast', new GrokClient(config.xai.apiKey));
    this.clients.set('openrouter-cheap', new OpenRouterClient(
      config.openrouter.apiKey,
      config.openrouter.defaultModel
    ));

    // Initialize call counts
    for (const modelId of this.clients.keys()) {
      this.callCounts.set(modelId, 0);
    }
  }

  /**
   * Bind a character to a specific model.
   * Once bound, ALL generation for this character uses this model.
   */
  bindCharacter(
    characterId: string,
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
  getCharacterBinding(characterId: string): CharacterVoiceBinding | undefined {
    return this.characterBindings.get(characterId);
  }

  /**
   * Generate content directly using a specific model.
   * Use for non-character tasks (extraction, planning, review).
   */
  async generate(
    modelId: ModelIdentifier,
    prompt: string,
    options: GenerationOptions = {}
  ): Promise<string> {
    const client = this.clients.get(modelId);
    if (!client) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    this.incrementCallCount(modelId);

    try {
      return await this.withRetry(() => client.generate(prompt, options), modelId);
    } catch (error) {
      // Try fallback if available
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
   * Enforces voice binding and includes voice profile in prompt.
   */
  async generateAsCharacter(
    characterId: string,
    prompt: string,
    context: GenerationContext = {}
  ): Promise<string> {
    const binding = this.characterBindings.get(characterId);
    if (!binding) {
      throw new Error(`No voice binding for character: ${characterId}`);
    }

    const fullPrompt = this.buildCharacterPrompt(binding.voiceProfile, prompt, context);
    
    return this.generate(binding.modelId, fullPrompt, {
      temperature: 0.75, // Slightly creative for character voice
    });
  }

  /**
   * Generate with structured output (JSON).
   * Uses prompt engineering to get JSON response.
   */
  async generateStructured<T>(
    modelId: ModelIdentifier,
    prompt: string,
    options: GenerationOptions = {}
  ): Promise<T> {
    const structuredPrompt = `${prompt}

IMPORTANT: Respond with valid JSON only. No markdown, no explanation, just the JSON object.`;

    const response = await this.generate(modelId, structuredPrompt, options);
    
    // Clean up response (remove markdown code blocks if present)
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
   * Get call counts for monitoring/cost tracking.
   */
  getCallCounts(): Record<ModelIdentifier, number> {
    return Object.fromEntries(this.callCounts) as Record<ModelIdentifier, number>;
  }

  /**
   * Reset call counts (e.g., between generations).
   */
  resetCallCounts(): void {
    for (const modelId of this.clients.keys()) {
      this.callCounts.set(modelId, 0);
    }
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
        
        // Check if rate limit error
        if (this.isRateLimitError(error)) {
          const backoff = this.getBackoffMs(modelId, i);
          console.warn(`Rate limited on ${modelId}, waiting ${backoff}ms`);
          await this.sleep(backoff);
          continue;
        }
        
        // Non-retryable error
        throw error;
      }
    }
    
    throw lastError ?? new Error('Max retries exceeded');
  }

  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('rate') || 
             error.message.includes('429') ||
             error.message.includes('quota');
    }
    return false;
  }

  private getBackoffMs(modelId: ModelIdentifier, attempt: number): number {
    const baseMs: Record<ModelIdentifier, number> = {
      'claude-opus': 5000,
      'claude-sonnet': 3000,
      'claude-haiku': 2000,
      'gpt-5.2-nano': 2000,
      'gemini-3-flash': 1000,
      'grok-3-fast': 2000,
      'openrouter-cheap': 1000,
    };
    
    return (baseMs[modelId] ?? 2000) * Math.pow(2, attempt);
  }

  private getFallback(modelId: ModelIdentifier): ModelIdentifier | undefined {
    const fallbacks: Partial<Record<ModelIdentifier, ModelIdentifier>> = {
      'claude-opus': 'claude-sonnet',
      'claude-sonnet': 'claude-haiku',
      'claude-haiku': 'gpt-5.2-nano',
      'gpt-5.2-nano': 'gemini-3-flash',
      'gemini-3-flash': 'openrouter-cheap',
      'grok-3-fast': 'gpt-5.2-nano',
    };
    
    return fallbacks[modelId];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createModelRouter(): ModelRouter {
  const config: ModelConfig = {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! },
    openai: { apiKey: process.env.OPENAI_API_KEY! },
    google: { apiKey: process.env.GOOGLE_AI_API_KEY! },
    xai: { apiKey: process.env.XAI_API_KEY! },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY!,
      defaultModel: 'mistralai/mistral-7b-instruct',
    },
  };

  // Validate all keys present
  const missing: string[] = [];
  if (!config.anthropic.apiKey) missing.push('ANTHROPIC_API_KEY');
  if (!config.openai.apiKey) missing.push('OPENAI_API_KEY');
  if (!config.google.apiKey) missing.push('GOOGLE_AI_API_KEY');
  if (!config.xai.apiKey) missing.push('XAI_API_KEY');
  if (!config.openrouter.apiKey) missing.push('OPENROUTER_API_KEY');

  if (missing.length > 0) {
    throw new Error(`Missing API keys: ${missing.join(', ')}`);
  }

  return new ModelRouter(config);
}

// =============================================================================
// EXPORTS
// =============================================================================

export type { ModelClient };
