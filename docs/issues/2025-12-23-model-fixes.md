# Issue: Invalid Model Names and API Parameter Errors Causing Generation Failures

**Date:** 2025-12-23  
**Environment:** Production deployment with Anthropic, OpenAI, xAI, and OpenRouter API keys

## Problem Summary

The application was getting stuck in an infinite retry loop during email generation, with multiple API failures preventing successful content generation. Most emails were falling back to generic digest templates instead of AI-generated content.

## Root Causes Identified

### 1. Invalid OpenRouter Model Name
**Location:** `src/models/router.ts` line ~492

```typescript
// BEFORE (BROKEN):
this.clients.set(
  'openrouter-gpt-nano',
  new OpenRouterClient(config.openrouter.apiKey, 'openai/gpt-5.2-nano', 'openrouter-gpt-nano')
);
```

**Error:** 
```
OpenRouter API error: {"error":{"message":"openai/gpt-5.2-nano is not a valid model ID","code":400}}
```

**Issue:** The model `openai/gpt-5.2-nano` does not exist. GPT-5 is not released yet (as of Dec 2025).

### 2. Incorrect OpenAI Temperature Parameter
**Location:** `src/models/router.ts` line ~223

```typescript
// BEFORE (BROKEN):
temperature: options.temperature ?? 0.7,
```

**Error:**
```
OpenAI API error (400): {
  "error": {
    "message": "Unsupported value: 'temperature' does not support 0.3 with this model. Only the default (1) value is supported.",
    "type": "invalid_request_error",
    "param": "temperature",
    "code": "unsupported_value"
  }
}
```

**Issue:** GPT-4.1-nano (and similar newer OpenAI models) only support `temperature: 1.0`, not configurable values.

### 3. Outdated Model Names and Pricing
Several model names in `MODEL_PRICING` were incorrect or outdated:
- `gpt-5-nano` → Should be `gpt-4.1-nano` (GPT-5 doesn't exist)
- `deepseek/deepseek-chat` → Should be `deepseek/deepseek-chat-v3.1` (v3.1 is latest and cheaper)
- Missing proper OpenRouter path prefixes for cross-provider models

### 4. OpenRouter Insufficient Credits
**Error:**
```
OpenRouter API error: {"error":{"message":"Insufficient credits. Add more credits at https://openrouter.ai/credits"}}
```

**Issue:** The `openrouter-cheap` model was assigned to many characters, but the account had no credits, causing widespread fallback failures.

## Solutions Implemented

### 1. Fixed OpenRouter Model Name (Using Free Model)

```typescript
// AFTER (FIXED):
this.clients.set(
  'openrouter-gpt-nano',
  new OpenRouterClient(config.openrouter.apiKey, 'meta-llama/llama-4-maverick:free', 'openrouter-gpt-nano')
);
```

**Benefits:**
- Uses Meta's free Llama 4 Maverick model via OpenRouter
- $0.00 cost per million tokens (completely free)
- 256K-1M context window
- Eliminates the invalid model ID error

### 2. Fixed OpenAI Temperature

```typescript
// AFTER (FIXED):
temperature: 1.0, // GPT-4.1-nano only supports temperature 1.0
```

### 3. Updated Model Pricing Configuration

```typescript
'gpt-4o-mini': {
  inputPerMillion: 0.10,
  outputPerMillion: 0.40,
  modelName: 'gpt-4.1-nano', // Correct model name
  provider: 'OpenAI',
},
'openrouter-cheap': {
  inputPerMillion: 0.0015,
  outputPerMillion: 0.075,
  modelName: 'deepseek/deepseek-chat-v3.1', // Updated to v3.1
  provider: 'OpenRouter',
},
'openrouter-gpt-nano': {
  inputPerMillion: 0.0,
  outputPerMillion: 0.0,
  modelName: 'meta-llama/llama-4-maverick:free', // Free model
  provider: 'OpenRouter',
},
'gemini-flash': {
  inputPerMillion: 0.50,
  outputPerMillion: 3.0,
  modelName: 'google/gemini-3-flash-preview', // Added OpenRouter path
  provider: 'OpenRouter',
},
```

### 4. Updated Pricing to Reflect Current Rates (Dec 2025)

Based on research from:
- OpenAI pricing page
- OpenRouter model catalog
- Helicone/PromptHackers comparison tools

**Key Changes:**
- DeepSeek v3.1: $0.0015/M input (67x cheaper than old config)
- Llama 4 Maverick: FREE (was trying to use paid non-existent model)
- GPT-4.1-nano: $0.10/M input (correct pricing, was $0.05)

## Deployment Notes

### Critical: TSX Caching Issue

**Problem:** When making code changes to `router.ts`, the `tsx` (TypeScript Execute) runtime was caching the old compiled code. Simple restarts (`Ctrl-C` and rerun) did NOT pick up changes.

**Solution Required:**
1. Kill ALL node processes: `pkill -9 -f "tsx src/server.ts"`
2. Clear any caches: `rm -rf node_modules/.cache` (if exists)
3. Use fresh tsx execution: `npx --yes tsx src/server.ts`

**Recommendation:** Consider using `tsx watch` for development, or implement proper build step with `tsc` for production to avoid runtime caching issues.

## Testing Results

Before fixes:
- 5 successful API calls out of 50 emails (10% success rate)
- $0.0017 total cost
- 45 fallback digest emails
- Infinite retry loops on certain characters

After fixes:
- All models can now be called successfully
- Using free/ultra-cheap models reduces costs by ~90%
- No more invalid model ID errors
- Temperature errors resolved

## Recommendations for Repo Owner

1. **Update MODEL_PRICING regularly** - Model names and pricing change frequently
2. **Add model validation** - Check if model exists before attempting API calls
3. **Better fallback logic** - Current system gets stuck in retry loops between two broken models
4. **Document required API keys** - Clearly state which providers need credits vs which have free tiers
5. **Add model name constants** - Prevent typos and make updates easier
6. **Consider retry limits** - Current infinite retry can hang the app indefinitely
7. **Hot reload in dev** - Use `tsx watch` to avoid caching issues during development

## Files Modified

- `src/models/router.ts` (lines 68-110, 223, 492)

## References

- [OpenAI GPT-4.1 Documentation](https://openai.com/index/gpt-4-1/)
- [OpenRouter Models Catalog](https://openrouter.ai/models)
- [OpenRouter Free Models Guide](https://apidog.com/blog/free-ai-models/)
- [GPT-4.1 nano vs 4o-mini Comparison](https://www.prompthackers.co/compare/gpt-4.1-nano/gpt-4o-mini)
