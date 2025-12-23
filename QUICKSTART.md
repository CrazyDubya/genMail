# EmailVerse Quickstart

Get something running fast, then iterate.

## Prerequisites

- Node.js 20+
- pnpm 8+
- API keys for: Anthropic, OpenAI, Google AI, xAI, OpenRouter

## Setup

```bash
# Clone and install
cd emailverse
pnpm install

# Copy environment template
cp .env.example .env
# Edit .env and add your API keys

# Initialize database
pnpm run db:init

# Start development server
pnpm run dev
```

## First Milestone: Proof of Life

Before building the full system, prove the core components work:

### 1. Model Router Works (30 min)

Create a simple test that calls all 5 model providers:

```typescript
// packages/agents/src/models/test-models.ts
import { ModelRouter } from './router';

async function testAllModels() {
  const router = new ModelRouter(config);
  
  const prompt = "Say 'hello' in exactly 5 words.";
  
  console.log('Testing Claude...');
  console.log(await router.generate('claude-sonnet', prompt));
  
  console.log('Testing GPT...');
  console.log(await router.generate('gpt-5.2-nano', prompt));
  
  console.log('Testing Gemini...');
  console.log(await router.generate('gemini-3-flash', prompt));
  
  console.log('Testing Grok...');
  console.log(await router.generate('grok-3-fast', prompt));
  
  console.log('Testing OpenRouter...');
  console.log(await router.generate('openrouter-cheap', prompt));
}

testAllModels();
```

**Success**: All 5 models respond.

### 2. Document Processing Works (1 hr)

Process a single document and extract entities:

```typescript
// scripts/test-extraction.ts
import { processDocument } from '@emailverse/agents';

async function testExtraction() {
  const doc = await readFile('./test-docs/sample.txt', 'utf-8');
  
  const result = await processDocument(doc);
  
  console.log('Chunks:', result.chunks.length);
  console.log('Entities:', result.entities);
  console.log('Themes:', result.themes);
}

testExtraction();
```

**Success**: Entities and themes extracted from a sample document.

### 3. Character Generation Works (1 hr)

Generate a single deep character from an entity:

```typescript
// scripts/test-character.ts
import { generateCharacter } from '@emailverse/agents';

async function testCharacter() {
  const entity = {
    name: 'Dr. Sarah Chen',
    type: 'person',
    mentions: [...],
  };
  
  const character = await generateCharacter({
    source: 'intrinsic',
    baseEntity: entity,
  });
  
  console.log('Character:', JSON.stringify(character, null, 2));
  console.log('Voice samples:', character.voiceBinding.voiceProfile.sampleOutputs);
}

testCharacter();
```

**Success**: Deep character profile with voice samples generated.

### 4. Single Email Generation Works (30 min)

Generate one email as a character:

```typescript
// scripts/test-email.ts
import { generateEmail } from '@emailverse/agents';

async function testEmail() {
  const character = /* load character from previous step */;
  
  const email = await generateEmail({
    author: character,
    type: 'standalone',
    subject: 'Quick question about the project',
    recipient: 'team@example.com',
    context: 'Following up on the meeting yesterday',
  });
  
  console.log('Email:', email);
}

testEmail();
```

**Success**: Email generated that sounds like the character.

### 5. Basic UI Renders (1 hr)

Get the email client shell rendering:

```html
<!-- apps/local/public/index.html -->
<!DOCTYPE html>
<html>
<head>
  <title>EmailVerse</title>
  <link rel="stylesheet" href="/styles/theme-recovered.css">
</head>
<body>
  <email-app>
    <folder-list slot="folders"></folder-list>
    <email-list slot="list"></email-list>
    <email-view slot="view"></email-view>
  </email-app>
  <script type="module" src="/components/index.js"></script>
</body>
</html>
```

**Success**: Three-panel layout renders with styling.

## First Full Run

Once the components are proven, wire them together:

1. Upload a document through the UI
2. Watch progress indicator
3. See emails appear in the inbox
4. Read a thread

This is the moment of truth for v0.1.

## Debugging Tips

### Model Not Responding
- Check API key in .env
- Check rate limits
- Try with curl first to isolate

### Extraction Missing Entities
- Check chunk size (too small = context loss)
- Check prompt template
- Try different document

### Character Voice Inconsistent
- Verify same model used for all emails
- Check voice samples are included in prompt
- Add more specific quirks

### Emails Not Threading
- Check in-reply-to headers
- Verify thread IDs match
- Check timestamp ordering

### UI Not Rendering
- Check Web Component registration
- Check for JS errors in console
- Verify CSS is loading

## Key Files to Build First

1. `packages/core/src/types.ts` - Already exists!
2. `packages/agents/src/models/router.ts` - Model orchestration
3. `packages/agents/src/research/extractor.ts` - Entity extraction
4. `packages/agents/src/character/generator.ts` - Character creation
5. `packages/simulation/src/tick.ts` - Simulation loop
6. `packages/agents/src/content/email-gen.ts` - Email generation
7. `packages/ui/src/components/email-app.ts` - Main UI shell

Build in this order. Each step proves the previous works.
