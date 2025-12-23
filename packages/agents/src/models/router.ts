// packages/agents/src/models/router.ts

interface ModelBinding {
  characterId: string;
  modelId: ModelIdentifier;
  voiceProfile: VoiceProfile;
}

class ModelRouter {
  private bindings: Map<string, ModelBinding> = new Map();
  private clients: Map<ModelIdentifier, ModelClient> = new Map();
  
  constructor(config: ModelConfig) {
    this.clients.set('claude-sonnet', new ClaudeClient(config.anthropic));
    this.clients.set('claude-haiku', new ClaudeClient(config.anthropic));
    this.clients.set('gpt-5.2-nano', new OpenAIClient(config.openai));
    this.clients.set('gemini-3-flash', new GeminiClient(config.google));
    this.clients.set('grok-3-fast', new GrokClient(config.xai));
    this.clients.set('openrouter-cheap', new OpenRouterClient(config.openrouter));
  }
  
  bindCharacter(characterId: string, modelId: ModelIdentifier, voice: VoiceProfile) {
    this.bindings.set(characterId, { characterId, modelId, voiceProfile: voice });
  }
  
  async generateAsCharacter(
    characterId: string, 
    prompt: string, 
    context: GenerationContext
  ): Promise<string> {
    const binding = this.bindings.get(characterId);
    if (!binding) throw new Error(`No binding for character ${characterId}`);
    
    const client = this.clients.get(binding.modelId);
    if (!client) throw new Error(`No client for model ${binding.modelId}`);
    
    const fullPrompt = this.buildCharacterPrompt(binding.voiceProfile, prompt, context);
    return client.generate(fullPrompt);
  }
  
  private buildCharacterPrompt(
    voice: VoiceProfile, 
    prompt: string, 
    context: GenerationContext
  ): string {
    return `
You are writing as a character with the following voice profile:
${JSON.stringify(voice, null, 2)}

Here are examples of how this character writes:
${voice.sampleOutputs.join('\n---\n')}

Context:
- This is an email in a thread about: ${context.threadSubject}
- Previous messages in thread: ${context.previousMessages.length}
- Character's relationship to recipients: ${context.relationships}
- Character's current emotional state: ${context.emotionalState}
- Character knows: ${context.characterKnowledge}

Write the email content for:
${prompt}

Write ONLY the email body. Match the voice profile exactly.
    `;
  }
}
