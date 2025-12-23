# Model Configuration Guide

## Overview

EmailVerse uses 5+ LLM providers strategically. Each model has strengths that match specific tasks.

## Model Roster

### Claude (Anthropic)

**claude-opus** / **claude-sonnet**
- **Role**: Director, strategic decisions, character psychology, coherence review
- **Strengths**: Complex reasoning, nuanced understanding, instruction following
- **Use for**: 
  - Orchestration decisions
  - Character deep psychology generation
  - Relationship and tension inference
  - Quality review passes
  - Complex narrative planning
- **Cost tier**: Premium
- **Temperature**: 0.7-0.9 for creative, 0.3-0.5 for analysis

**claude-haiku**
- **Role**: Fast Claude tasks, mid-tier coherence
- **Strengths**: Speed, Claude quality at lower cost
- **Use for**:
  - Content team lead
  - Quick reviews
  - Structured extraction
- **Cost tier**: Standard
- **Temperature**: 0.5-0.7

### GPT (OpenAI)

**gpt-5.2-nano**
- **Role**: General character voices, reliable dialogue
- **Strengths**: Consistent voice, good dialogue, reliable
- **Use for**:
  - Default character binding for "normal" characters
  - Thread message generation
  - General email content
- **Cost tier**: Standard
- **Temperature**: 0.7-0.8

### Gemini (Google)

**gemini-3-flash**
- **Role**: Research team lead, high-volume extraction
- **Strengths**: Fast, good at structured data, precise language
- **Use for**:
  - Document chunking decisions
  - Entity extraction
  - Technical character voices
  - Newsletter content (structured)
- **Cost tier**: Standard
- **Temperature**: 0.4-0.6 for extraction, 0.7 for generation

### Grok (xAI)

**grok-3-fast**
- **Role**: Creative/chaotic characters, unexpected content
- **Strengths**: Creative flair, humor, unconventional takes
- **Use for**:
  - Skeptic characters
  - Humorous spam
  - Characters who don't follow rules
  - Unexpected thread turns
- **Cost tier**: Standard
- **Temperature**: 0.8-1.0

### OpenRouter (Various)

**openrouter-cheap**
- **Role**: High-volume, low-stakes content
- **Strengths**: Cost efficiency, scale
- **Recommended models**: 
  - `mistralai/mistral-7b-instruct` (fast, cheap)
  - `meta-llama/llama-3.1-8b-instruct` (good quality/cost)
  - `google/gemma-2-9b-it` (reliable)
- **Use for**:
  - Spam emails
  - Automated system messages
  - Bulk newsletter content
  - Bot characters
- **Cost tier**: Economy
- **Temperature**: 0.7-0.9

---

## Character-to-Model Assignment Heuristics

```typescript
function assignModelToCharacter(character: CharacterPsychology): ModelIdentifier {
  // Premium tier: complex characters
  if (character.secretCount > 2 || character.goalComplexity === 'high') {
    return 'claude-haiku';
  }
  
  // Economy tier: low-stakes characters
  if (character.archetype === 'spammer' || character.archetype === 'bot') {
    return 'openrouter-cheap';
  }
  
  // Creative tier: unconventional characters
  if (character.traits.includes('chaotic') || 
      character.traits.includes('humorous') ||
      character.archetype === 'skeptic') {
    return 'grok-3-fast';
  }
  
  // Technical tier: precision characters
  if (character.traits.includes('technical') ||
      character.traits.includes('analytical')) {
    return 'gemini-3-flash';
  }
  
  // Default: reliable mid-tier
  return 'gpt-5.2-nano';
}
```

---

## Task-to-Model Assignment

| Task | Model | Reason |
|------|-------|--------|
| Director orchestration | claude-sonnet | Strategic reasoning |
| Character psychology | claude-sonnet | Deep understanding |
| Document chunking | gemini-3-flash | Fast, structured |
| Entity extraction | gemini-3-flash | Precision |
| Relationship inference | claude-haiku | Nuanced |
| Tension identification | claude-sonnet | Narrative sense |
| Email generation | Character-bound | Voice consistency |
| Spam generation | openrouter-cheap | Volume |
| Newsletter generation | gemini-3-flash | Structured |
| Coherence review | claude-haiku | Quality |
| Thread planning | claude-haiku | Coherence |

---

## API Configuration

```typescript
// Environment variables
const config: ModelConfig = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    // Using Claude SDK
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    // Direct API or through OpenRouter
  },
  google: {
    apiKey: process.env.GOOGLE_AI_API_KEY!,
    // Google AI Studio / Vertex AI
  },
  xai: {
    apiKey: process.env.XAI_API_KEY!,
    // xAI API
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY!,
    defaultModel: 'mistralai/mistral-7b-instruct',
    // Can override per-request
  },
};
```

---

## Cost Management

### Estimated costs per universe (50-75 emails)

| Phase | Model | Calls | Est. Tokens | Est. Cost |
|-------|-------|-------|-------------|-----------|
| Analysis | gemini-3-flash | 10-20 | 50k | $0.05 |
| Characters | claude-sonnet | 10-15 | 30k | $0.15 |
| Voice samples | mixed | 30-40 | 20k | $0.08 |
| Simulation | claude-haiku | 20-30 | 40k | $0.08 |
| Email gen | mixed | 50-75 | 100k | $0.20 |
| Review | claude-haiku | 10-15 | 20k | $0.04 |
| **Total** | | | ~260k | **~$0.60** |

These are rough estimates. Actual costs depend on document size and generation patterns.

### Cost optimization strategies

1. **Batch similar tasks**: Send multiple extractions in one Gemini call
2. **Cache voice profiles**: Don't regenerate samples unnecessarily
3. **Use cheap models for drafts**: Review with Claude, generate with cheap
4. **Parallelize strategically**: More calls = faster but same cost

---

## Rate Limits and Quotas

| Provider | Limit | Strategy |
|----------|-------|----------|
| Anthropic | Varies by tier | Queue with backoff |
| OpenAI | 10k TPM (free), higher paid | Batch requests |
| Google | 60 RPM | Spread requests |
| xAI | Varies | Monitor and throttle |
| OpenRouter | Credit-based | Set budget limits |

### Rate limit handling

```typescript
async function withRateLimit<T>(
  fn: () => Promise<T>,
  modelId: ModelIdentifier,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (isRateLimitError(error)) {
        const backoff = getBackoffMs(modelId, i);
        await sleep(backoff);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Rate limit exceeded after ${maxRetries} retries`);
}
```

---

## Model Fallbacks

If a model is unavailable, fallback chain:

```
claude-sonnet → claude-haiku → gpt-5.2-nano
claude-haiku → gpt-5.2-nano → gemini-3-flash
gpt-5.2-nano → gemini-3-flash → openrouter-cheap
gemini-3-flash → gpt-5.2-nano → openrouter-cheap
grok-3-fast → gpt-5.2-nano (accept voice change)
openrouter-cheap → (rotate through cheap models)
```

**Important**: Fallbacks for character-bound models break voice consistency. Log a warning and consider regenerating the character's prior emails if this happens.
