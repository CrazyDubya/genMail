/**
 * ModelRouter - Central hub for all LLM interactions
 *
 * All model calls go through here. Character voice binding is enforced here.
 * Includes cost tracking and detailed logging for transparency.
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

// =============================================================================
// COST TRACKING - Pricing per million tokens (December 2025)
// =============================================================================

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  modelName: string;
  provider: string;
}

// Latest model pricing as of December 2025
export const MODEL_PRICING: Record<ModelIdentifier, ModelPricing> = {
  'claude-opus': {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    modelName: 'claude-opus-4-5-20251101',
    provider: 'Anthropic',
  },
  'claude-sonnet': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    modelName: 'claude-sonnet-4-5-20250929',
    provider: 'Anthropic',
  },
  'claude-haiku': {
    inputPerMillion: 0.8,
    outputPerMillion: 4.0,
    modelName: 'claude-haiku-4-5-20251001',
    provider: 'Anthropic',
  },
  'gpt-4o-mini': {
    inputPerMillion: 0.10,
    outputPerMillion: 0.40,
    modelName: 'gpt-4.1-nano', // Correct model name (GPT-5 doesn't exist)
    provider: 'OpenAI',
  },
  'gemini-flash': {
    inputPerMillion: 0.50,
    outputPerMillion: 3.0,
    modelName: 'gemini-3-flash-preview', // Updated: Gemini 3 Flash
    provider: 'Google',
  },
  'grok-fast': {
    inputPerMillion: 0.20,
    outputPerMillion: 0.50,
    modelName: 'grok-3-fast',
    provider: 'xAI',
  },
  'openrouter-cheap': {
    inputPerMillion: 0.0015,
    outputPerMillion: 0.075,
    modelName: 'deepseek/deepseek-chat-v3.1',  // Updated to v3.1 (latest and cheaper)
    provider: 'OpenRouter',
  },
  'openrouter-gpt-nano': {
    inputPerMillion: 0.0,
    outputPerMillion: 0.0,
    modelName: 'meta-llama/llama-4-maverick:free',  // Free Llama 4 model via OpenRouter
    provider: 'OpenRouter',
  },
  'openrouter-haiku': {
    inputPerMillion: 1.0,
    outputPerMillion: 5.0,
    modelName: 'anthropic/claude-3.5-haiku',  // Claude Haiku via OpenRouter
    provider: 'OpenRouter',
  },
  'openrouter-flash': {
    inputPerMillion: 0.60,
    outputPerMillion: 3.50,
    modelName: 'google/gemini-2.0-flash-exp',  // Gemini Flash via OpenRouter
    provider: 'OpenRouter',
  },
};

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

export interface ModelCallLog {
  timestamp: Date;
  modelId: ModelIdentifier;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  durationMs: number;
  success: boolean;
  error?: string;
  purpose?: string;
}

export interface GenerationResult {
  text: string;
  usage: UsageStats;
  durationMs: number;
}

interface ModelClient {
  generate(prompt: string, options: GenerationOptions): Promise<GenerationResult>;
}

// =============================================================================
// MODEL CLIENTS
// =============================================================================

class ClaudeClient implements ModelClient {
  private client: Anthropic;
  private model: string;
  private modelId: ModelIdentifier;

  constructor(apiKey: string, model: 'opus' | 'sonnet' | 'haiku') {
    this.client = new Anthropic({ apiKey });
    const modelMap = {
      opus: 'claude-opus-4-5-20251101',
      sonnet: 'claude-sonnet-4-5-20250929',
      haiku: 'claude-haiku-4-5-20251001',
    };
    const idMap: Record<string, ModelIdentifier> = {
      opus: 'claude-opus',
      sonnet: 'claude-sonnet',
      haiku: 'claude-haiku',
    };
    this.model = modelMap[model];
    this.modelId = idMap[model];
  }

  async generate(prompt: string, options: GenerationOptions): Promise<GenerationResult> {
    const startTime = Date.now();
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

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const pricing = MODEL_PRICING[this.modelId];
    const estimatedCost = (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1_000_000;

    return {
      text: textBlock.text,
      usage: { inputTokens, outputTokens, estimatedCost },
      durationMs: Date.now() - startTime,
    };
  }
}

class OpenAIClient implements ModelClient {
  private apiKey: string;
  private model: string;
  private modelId: ModelIdentifier;

  constructor(apiKey: string, model: string = 'gpt-4.1-nano', modelId: ModelIdentifier = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
    this.modelId = modelId;
  }

  async generate(prompt: string, options: GenerationOptions): Promise<GenerationResult> {
    const startTime = Date.now();
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
        // Use max_completion_tokens for newer OpenAI models (GPT-4o+)
        max_completion_tokens: options.maxTokens ?? 2048,
        temperature: 1.0, // GPT-4.1-nano only supports temperature 1.0
        stop: options.stopSequences,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      const status = response.status;
      throw new Error(`OpenAI API error (${status}): ${error}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const inputTokens = data.usage?.prompt_tokens ?? this.estimateTokens(prompt);
    const outputTokens = data.usage?.completion_tokens ?? this.estimateTokens(data.choices[0].message.content);
    const pricing = MODEL_PRICING[this.modelId];
    const estimatedCost = (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1_000_000;

    return {
      text: data.choices[0].message.content,
      usage: { inputTokens, outputTokens, estimatedCost },
      durationMs: Date.now() - startTime,
    };
  }

  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}

class GeminiClient implements ModelClient {
  private apiKey: string;
  private model: string;
  private modelId: ModelIdentifier;

  constructor(apiKey: string, model: string = 'gemini-3-flash-preview', modelId: ModelIdentifier = 'gemini-flash') {
    this.apiKey = apiKey;
    this.model = model;
    this.modelId = modelId;
  }

  async generate(prompt: string, options: GenerationOptions): Promise<GenerationResult> {
    const startTime = Date.now();
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
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
    };

    const outputText = data.candidates[0].content.parts[0].text;
    const inputTokens = data.usageMetadata?.promptTokenCount ?? this.estimateTokens(prompt);
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? this.estimateTokens(outputText);
    const pricing = MODEL_PRICING[this.modelId];
    const estimatedCost = (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1_000_000;

    return {
      text: outputText,
      usage: { inputTokens, outputTokens, estimatedCost },
      durationMs: Date.now() - startTime,
    };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

class GrokClient implements ModelClient {
  private apiKey: string;
  private model: string;
  private modelId: ModelIdentifier;

  constructor(apiKey: string, model: string = 'grok-3-fast', modelId: ModelIdentifier = 'grok-fast') {
    this.apiKey = apiKey;
    this.model = model;
    this.modelId = modelId;
  }

  async generate(prompt: string, options: GenerationOptions): Promise<GenerationResult> {
    const startTime = Date.now();
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
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const outputText = data.choices[0].message.content;
    const inputTokens = data.usage?.prompt_tokens ?? this.estimateTokens(prompt);
    const outputTokens = data.usage?.completion_tokens ?? this.estimateTokens(outputText);
    const pricing = MODEL_PRICING[this.modelId];
    const estimatedCost = (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1_000_000;

    return {
      text: outputText,
      usage: { inputTokens, outputTokens, estimatedCost },
      durationMs: Date.now() - startTime,
    };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

class OpenRouterClient implements ModelClient {
  private apiKey: string;
  private model: string;
  private modelId: ModelIdentifier;

  constructor(apiKey: string, model: string = 'deepseek/deepseek-chat-v3.1', modelId: ModelIdentifier = 'openrouter-cheap') {
    this.apiKey = apiKey;
    this.model = model;
    this.modelId = modelId;
  }

  async generate(prompt: string, options: GenerationOptions): Promise<GenerationResult> {
    const startTime = Date.now();
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
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const outputText = data.choices[0].message.content;
    const inputTokens = data.usage?.prompt_tokens ?? this.estimateTokens(prompt);
    const outputTokens = data.usage?.completion_tokens ?? this.estimateTokens(outputText);
    const pricing = MODEL_PRICING[this.modelId];
    const estimatedCost = (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1_000_000;

    return {
      text: outputText,
      usage: { inputTokens, outputTokens, estimatedCost },
      durationMs: Date.now() - startTime,
    };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

// =============================================================================
// MODEL ROUTER
// =============================================================================

export interface CumulativeUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  callCount: number;
  byModel: Record<ModelIdentifier, UsageStats & { callCount: number }>;
}

export class ModelRouter {
  private clients: Map<ModelIdentifier, ModelClient> = new Map();
  private characterBindings: Map<string, CharacterVoiceBinding> = new Map();
  private callCounts: Map<ModelIdentifier, number> = new Map();
  private callLog: ModelCallLog[] = [];
  private cumulativeUsage: CumulativeUsage = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    callCount: 0,
    byModel: {} as Record<ModelIdentifier, UsageStats & { callCount: number }>,
  };

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
      // Add OpenRouter fallback models for resilience
      this.clients.set(
        'openrouter-gpt-nano',
        new OpenRouterClient(config.openrouter.apiKey, 'meta-llama/llama-4-maverick:free', 'openrouter-gpt-nano')
      );
      this.clients.set(
        'openrouter-haiku',
        new OpenRouterClient(config.openrouter.apiKey, 'anthropic/claude-3.5-haiku', 'openrouter-haiku')
      );
      this.clients.set(
        'openrouter-flash',
        new OpenRouterClient(config.openrouter.apiKey, 'google/gemini-2.0-flash-exp', 'openrouter-flash')
      );
    }

    // Initialize call counts and usage tracking
    for (const modelId of this.clients.keys()) {
      this.callCounts.set(modelId, 0);
      this.cumulativeUsage.byModel[modelId] = {
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
        callCount: 0,
      };
    }

    const availableModels = this.getAvailableModels();
    if (availableModels.length === 0) {
      console.warn('[ModelRouter] WARNING: No API keys configured! All email generation will use fallback templates.');
      console.warn('[ModelRouter] Set environment variables: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_AI_API_KEY, XAI_API_KEY, OPENROUTER_API_KEY');
    } else {
      console.log(`[ModelRouter] Initialized with models: ${availableModels.join(', ')}`);
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
   * Returns just the text for backward compatibility.
   */
  async generate(
    modelId: ModelIdentifier,
    prompt: string,
    options: GenerationOptions = {},
    purpose?: string
  ): Promise<string> {
    const result = await this.generateWithUsage(modelId, prompt, options, purpose);
    return result.text;
  }

  /**
   * Generate content with full usage statistics.
   */
  async generateWithUsage(
    modelId: ModelIdentifier,
    prompt: string,
    options: GenerationOptions = {},
    purpose?: string
  ): Promise<GenerationResult> {
    const client = this.clients.get(modelId);
    if (!client) {
      // Try fallback
      const fallback = this.getFallback(modelId);
      if (fallback) {
        console.warn(`[ModelRouter] Model ${modelId} not available, falling back to ${fallback}`);
        return this.generateWithUsage(fallback, prompt, options, purpose);
      }
      throw new Error(`Unknown model: ${modelId}`);
    }

    this.incrementCallCount(modelId);

    const startTime = Date.now();
    try {
      const result = await this.withRetry(() => client.generate(prompt, options), modelId);

      // Log the call
      this.logCall({
        timestamp: new Date(),
        modelId,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        estimatedCost: result.usage.estimatedCost,
        durationMs: result.durationMs,
        success: true,
        purpose,
      });

      // Update cumulative usage
      this.updateCumulativeUsage(modelId, result.usage);

      console.log(
        `[ModelRouter] ${modelId}: ${result.usage.inputTokens}in/${result.usage.outputTokens}out tokens, ` +
        `$${result.usage.estimatedCost.toFixed(6)}, ${result.durationMs}ms` +
        (purpose ? ` (${purpose})` : '')
      );

      return result;
    } catch (error) {
      // Log failed call
      this.logCall({
        timestamp: new Date(),
        modelId,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
        durationMs: Date.now() - startTime,
        success: false,
        error: (error as Error).message,
        purpose,
      });

      const fallback = this.getFallback(modelId);
      if (fallback) {
        console.warn(`[ModelRouter] Falling back from ${modelId} to ${fallback}: ${(error as Error).message}`);
        return this.generateWithUsage(fallback, prompt, options, purpose);
      }
      throw error;
    }
  }

  private logCall(log: ModelCallLog): void {
    this.callLog.push(log);
    // Keep only last 1000 calls in memory
    if (this.callLog.length > 1000) {
      this.callLog.shift();
    }
  }

  private updateCumulativeUsage(modelId: ModelIdentifier, usage: UsageStats): void {
    this.cumulativeUsage.totalInputTokens += usage.inputTokens;
    this.cumulativeUsage.totalOutputTokens += usage.outputTokens;
    this.cumulativeUsage.totalCost += usage.estimatedCost;
    this.cumulativeUsage.callCount += 1;

    if (!this.cumulativeUsage.byModel[modelId]) {
      this.cumulativeUsage.byModel[modelId] = {
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
        callCount: 0,
      };
    }
    this.cumulativeUsage.byModel[modelId].inputTokens += usage.inputTokens;
    this.cumulativeUsage.byModel[modelId].outputTokens += usage.outputTokens;
    this.cumulativeUsage.byModel[modelId].estimatedCost += usage.estimatedCost;
    this.cumulativeUsage.byModel[modelId].callCount += 1;
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
   * Get cumulative usage statistics.
   */
  getCumulativeUsage(): CumulativeUsage {
    return { ...this.cumulativeUsage };
  }

  /**
   * Get the call log for debugging/monitoring.
   */
  getCallLog(): ModelCallLog[] {
    return [...this.callLog];
  }

  /**
   * Get a formatted cost summary.
   */
  getCostSummary(): string {
    const usage = this.cumulativeUsage;
    const lines = [
      `=== Cost Summary ===`,
      `Total Calls: ${usage.callCount}`,
      `Total Tokens: ${usage.totalInputTokens.toLocaleString()} in / ${usage.totalOutputTokens.toLocaleString()} out`,
      `Total Cost: $${usage.totalCost.toFixed(4)}`,
      ``,
      `By Model:`,
    ];

    for (const [modelId, stats] of Object.entries(usage.byModel)) {
      if (stats.callCount > 0) {
        lines.push(
          `  ${modelId}: ${stats.callCount} calls, ` +
          `${stats.inputTokens.toLocaleString()}/${stats.outputTokens.toLocaleString()} tokens, ` +
          `$${stats.estimatedCost.toFixed(4)}`
        );
      }
    }

    return lines.join('\n');
  }

  /**
   * Reset all usage statistics.
   */
  resetUsageStats(): void {
    this.callLog = [];
    this.cumulativeUsage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      callCount: 0,
      byModel: {} as Record<ModelIdentifier, UsageStats & { callCount: number }>,
    };
    for (const modelId of this.clients.keys()) {
      this.callCounts.set(modelId, 0);
      this.cumulativeUsage.byModel[modelId] = {
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
        callCount: 0,
      };
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
    // Determine formality description
    let formalityDesc: string;
    if (voice.formality < 0.3) {
      formalityDesc = 'CASUAL - use contractions, informal language, relaxed tone';
    } else if (voice.formality > 0.7) {
      formalityDesc = 'FORMAL - proper grammar, professional tone, no slang';
    } else {
      formalityDesc = 'moderate formality';
    }

    // Determine verbosity description
    let verbosityDesc: string;
    if (voice.verbosity < 0.3) {
      verbosityDesc = 'BRIEF - 2-3 sentences max, get to the point';
    } else if (voice.verbosity > 0.7) {
      verbosityDesc = 'DETAILED - provide context, elaborate on points';
    } else {
      verbosityDesc = 'moderate length';
    }

    // Build quirks requirement (if any)
    const quirksSection = voice.quirks.length > 0
      ? `\nMUST USE ONE OF THESE QUIRKS:\n${voice.quirks.map((q) => `• ${q}`).join('\n')}`
      : '';

    // Build vocabulary section (if any)
    const vocabSection = voice.vocabulary.length > 0
      ? `\n- USE these words/phrases: ${voice.vocabulary.slice(0, 5).join(', ')}`
      : '';

    return `WRITE AS THIS CHARACTER:

═══════════════════════════════════════════════════════════════════════════════
REQUIRED VOICE (MANDATORY)
═══════════════════════════════════════════════════════════════════════════════
- Greeting: "${voice.greetingPatterns[0] ?? 'Hi'}"
- Sign-off: "${voice.signoffPatterns[0] ?? 'Best'}"
- Formality: ${formalityDesc}
- Length: ${verbosityDesc}${vocabSection}
${quirksSection}

${context.previousMessages?.length ? `═══════════════════════════════════════════════════════════════════════════════
REPLYING TO:
${context.previousMessages.slice(-2).join('\n---\n')}` : ''}

${context.emotionalState ? `Current mood: ${context.emotionalState}` : ''}

═══════════════════════════════════════════════════════════════════════════════
FORBIDDEN PATTERNS (do NOT use these generic phrases)
═══════════════════════════════════════════════════════════════════════════════
• "we've been thinking"
• "threading the needle"
• "move the needle"
• "circle back"
• "synergy"
• "leverage" (as a verb)
• "going forward"
• Generic corporate speak

═══════════════════════════════════════════════════════════════════════════════
YOUR TASK:
${prompt}
═══════════════════════════════════════════════════════════════════════════════

Write ONLY the email body. Match the voice EXACTLY. No headers or metadata.`;
  }

  private incrementCallCount(modelId: ModelIdentifier): void {
    const current = this.callCounts.get(modelId) ?? 0;
    this.callCounts.set(modelId, current + 1);
  }

  private async withRetry(
    fn: () => Promise<GenerationResult>,
    modelId: ModelIdentifier,
    maxRetries: number = 3
  ): Promise<GenerationResult> {
    let lastError: Error | undefined;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // For connection/availability errors, fail fast to trigger fallback
        if (this.shouldFallback(error)) {
          console.warn(`[ModelRouter] API unavailable for ${modelId}: ${lastError.message}`);
          throw error; // Throw immediately to trigger fallback chain
        }

        // For rate limits, retry with backoff
        if (this.isRateLimitError(error)) {
          const backoff = this.getBackoffMs(modelId, i);
          console.warn(`[ModelRouter] Rate limited on ${modelId}, waiting ${backoff}ms (attempt ${i + 1}/${maxRetries})`);
          await this.sleep(backoff);
          continue;
        }

        // For other errors (parsing, unexpected), retry once then fail
        if (i < 1) {
          console.warn(`[ModelRouter] Retrying ${modelId} after error: ${lastError.message}`);
          await this.sleep(1000);
          continue;
        }

        // Log non-retryable errors
        console.error(`[ModelRouter] Error on ${modelId}: ${lastError.message}`);
        throw error;
      }
    }

    throw lastError ?? new Error('Max retries exceeded');
  }

  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('rate') ||
        msg.includes('429') ||
        msg.includes('quota') ||
        msg.includes('too many requests') ||
        msg.includes('capacity')
      );
    }
    return false;
  }

  /**
   * Determine if an error should trigger a fallback rather than retry.
   * Returns true for errors that indicate the API is unavailable or the model
   * is not accessible (auth errors, server errors, timeouts, etc.)
   */
  private shouldFallback(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('401') ||  // Unauthorized
        msg.includes('403') ||  // Forbidden
        msg.includes('404') ||  // Not found (model doesn't exist)
        msg.includes('500') ||  // Server error
        msg.includes('502') ||  // Bad gateway
        msg.includes('503') ||  // Service unavailable
        msg.includes('504') ||  // Gateway timeout
        msg.includes('timeout') ||
        msg.includes('econnrefused') ||
        msg.includes('network') ||
        msg.includes('fetch failed') ||
        msg.includes('connection')
      );
    }
    return false;
  }

  private getBackoffMs(modelId: ModelIdentifier, attempt: number): number {
    const baseMs: Partial<Record<ModelIdentifier, number>> = {
      'claude-opus': 5000,
      'claude-sonnet': 3000,
      'claude-haiku': 2000,
      'gpt-4o-mini': 2000,
      'gemini-flash': 1000,
      'grok-fast': 2000,
      'openrouter-cheap': 1000,
      'openrouter-gpt-nano': 1000,
      'openrouter-haiku': 1000,
      'openrouter-flash': 1000,
    };

    return (baseMs[modelId] ?? 2000) * Math.pow(2, attempt);
  }

  /**
   * Get the fallback model for a given model.
   * Uses deep preference-based routing across ALL available providers.
   * Any working API can stand in for another - Sonnet/Haiku can replace GPT,
   * Gemini Flash can replace Claude, Grok can replace Gemini, etc.
   */
  private getFallback(modelId: ModelIdentifier): ModelIdentifier | undefined {
    // Deep cross-provider fallback chains
    // Priority: same-tier alternatives → cheaper direct APIs → OpenRouter equivalents → cheap fallbacks
    const fallbacks: Partial<Record<ModelIdentifier, ModelIdentifier[]>> = {
      // === CLAUDE CHAIN ===
      // Opus → Sonnet → Haiku → GPT → Gemini → Grok → OpenRouter alternatives
      'claude-opus': [
        'claude-sonnet',
        'gpt-4o-mini',        // GPT as mid-tier alternative
        'gemini-flash',       // Gemini as alternative
        'grok-fast',          // Grok as alternative
        'openrouter-gpt-nano',
        'openrouter-haiku',
        'openrouter-flash',
        'openrouter-cheap',
      ],
      'claude-sonnet': [
        'claude-haiku',
        'gpt-4o-mini',
        'gemini-flash',
        'grok-fast',
        'openrouter-gpt-nano',
        'openrouter-haiku',
        'openrouter-flash',
        'openrouter-cheap',
      ],
      'claude-haiku': [
        'gpt-4o-mini',        // GPT nano is similar tier
        'gemini-flash',       // Gemini Flash is similar tier
        'grok-fast',          // Grok Fast is similar tier
        'openrouter-gpt-nano',
        'openrouter-haiku',
        'openrouter-flash',
        'openrouter-cheap',
      ],

      // === OPENAI CHAIN ===
      // GPT → OpenRouter GPT nano → Claude Haiku → Gemini → Grok → other OpenRouter
      'gpt-4o-mini': [
        'openrouter-gpt-nano', // Same model via OpenRouter
        'claude-haiku',        // Claude Haiku as alternative
        'gemini-flash',        // Gemini Flash as alternative
        'grok-fast',           // Grok Fast as alternative
        'openrouter-haiku',
        'openrouter-flash',
        'openrouter-cheap',
      ],

      // === GEMINI CHAIN ===
      // Gemini → OpenRouter flash → Claude Haiku → GPT → Grok → cheap
      'gemini-flash': [
        'openrouter-flash',    // Same via OpenRouter
        'claude-haiku',        // Claude as alternative
        'gpt-4o-mini',         // GPT as alternative
        'grok-fast',           // Grok as alternative
        'openrouter-gpt-nano',
        'openrouter-haiku',
        'openrouter-cheap',
      ],

      // === GROK CHAIN ===
      // Grok → GPT → Claude Haiku → Gemini → OpenRouter options
      'grok-fast': [
        'gpt-4o-mini',         // GPT as similar-tier
        'claude-haiku',        // Claude Haiku as alternative
        'gemini-flash',        // Gemini as alternative
        'openrouter-gpt-nano',
        'openrouter-flash',
        'openrouter-haiku',
        'openrouter-cheap',
      ],

      // === OPENROUTER CHAINS ===
      // Each OpenRouter model falls back to direct APIs first, then other OpenRouter models
      'openrouter-gpt-nano': [
        'gpt-4o-mini',         // Try direct OpenAI
        'claude-haiku',        // Claude as alternative
        'gemini-flash',        // Gemini as alternative
        'grok-fast',           // Grok as alternative
        'openrouter-flash',
        'openrouter-haiku',
        'openrouter-cheap',
      ],
      'openrouter-haiku': [
        'claude-haiku',        // Try direct Anthropic
        'gpt-4o-mini',         // GPT as alternative
        'gemini-flash',        // Gemini as alternative
        'grok-fast',           // Grok as alternative
        'openrouter-gpt-nano',
        'openrouter-flash',
        'openrouter-cheap',
      ],
      'openrouter-flash': [
        'gemini-flash',        // Try direct Google
        'claude-haiku',        // Claude as alternative
        'gpt-4o-mini',         // GPT as alternative
        'grok-fast',           // Grok as alternative
        'openrouter-gpt-nano',
        'openrouter-haiku',
        'openrouter-cheap',
      ],
      'openrouter-cheap': [
        // DeepSeek/cheap fallback - try all other cheap options
        'claude-haiku',
        'gpt-4o-mini',
        'gemini-flash',
        'grok-fast',
        'openrouter-gpt-nano',
        'openrouter-flash',
        'openrouter-haiku',
      ],
    };

    const fallbackList = fallbacks[modelId] ?? [];

    // Find first available fallback that isn't already failing
    for (const fallback of fallbackList) {
      if (this.clients.has(fallback)) {
        return fallback;
      }
    }

    // Ultimate fallback: try any available client
    for (const [clientId] of this.clients) {
      if (clientId !== modelId) {
        console.warn(`[ModelRouter] Using emergency fallback to ${clientId}`);
        return clientId;
      }
    }

    return undefined;
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
        config?.openrouter?.defaultModel ?? 'deepseek/deepseek-chat-v3.1', // DeepSeek v3.1 is latest and cheaper
    },
  };

  return new ModelRouter(fullConfig);
}
