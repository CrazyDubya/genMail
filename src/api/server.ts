/**
 * EmailVerse API Server
 *
 * Hono-based API for document upload, universe generation, and email retrieval.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { v4 as uuid } from 'uuid';
import type {
  CreateUniverseRequest,
  CreateUniverseResponse,
  UniverseStatusResponse,
  GetEmailsResponse,
  UniverseId,
  DocumentId,
  WorldConfig,
  RawDocument,
  Thread,
  Email,
  FolderType,
} from '../types.js';
import { createStorage, type Storage } from '../storage/sqlite.js';
import { createModelRouter, type ModelRouter } from '../models/router.js';
import { processDocuments, inferRelationships } from '../pipeline/documents.js';
import { generateCharacters } from '../pipeline/characters.js';
import { runSimulation, initializeTensions } from '../simulation/tick.js';

// =============================================================================
// APP SETUP
// =============================================================================

interface AppContext {
  storage: Storage;
  router: ModelRouter;
  generationJobs: Map<string, GenerationJob>;
}

interface GenerationJob {
  universeId: UniverseId;
  status: 'processing' | 'complete' | 'failed';
  progress: {
    phase: 'documents' | 'characters' | 'simulation' | 'complete';
    percentComplete: number;
    currentTask?: string;
  };
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

const app = new Hono();

// Global context
let ctx: AppContext;

// Initialize context
function initContext(): AppContext {
  const storage = createStorage('./emailverse.db');
  const router = createModelRouter();

  return {
    storage,
    router,
    generationJobs: new Map(),
  };
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

app.use('*', cors());

// JSON body parser is built into Hono

// =============================================================================
// API ROUTES
// =============================================================================

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create universe
app.post('/api/universe', async (c) => {
  try {
    const body = await c.req.json<CreateUniverseRequest>();

    if (!body.documents || body.documents.length === 0) {
      return c.json({ error: 'No documents provided' }, 400);
    }

    // Create universe with config
    const config: WorldConfig = {
      targetEmailCount: body.config?.targetEmailCount ?? 50,
      characterCount: body.config?.characterCount ?? { min: 6, max: 12 },
      extrinsicArchetypes: body.config?.extrinsicArchetypes ?? [
        'protagonist',
        'antagonist',
        'skeptic',
        'enthusiast',
      ],
      tensionDensity: body.config?.tensionDensity ?? 0.5,
      spamRatio: body.config?.spamRatio ?? 0.1,
      newsletterFrequency: body.config?.newsletterFrequency ?? 2,
    };

    const universeId = await ctx.storage.createUniverse(config);

    // Start generation job
    const job: GenerationJob = {
      universeId,
      status: 'processing',
      progress: {
        phase: 'documents',
        percentComplete: 0,
        currentTask: 'Processing documents',
      },
      startedAt: new Date(),
    };
    ctx.generationJobs.set(universeId, job);

    // Run generation in background
    generateUniverse(universeId, body.documents, config).catch((error) => {
      console.error('Generation failed:', error);
      job.status = 'failed';
      job.error = error.message;
    });

    const response: CreateUniverseResponse = {
      universeId,
      status: 'processing',
      estimatedCompletionMs: config.targetEmailCount * 2000, // Rough estimate
    };

    return c.json(response, 201);
  } catch (error) {
    console.error('Create universe error:', error);
    return c.json({ error: 'Failed to create universe' }, 500);
  }
});

// Get universe status
app.get('/api/universe/:id/status', async (c) => {
  const id = c.req.param('id') as UniverseId;

  const job = ctx.generationJobs.get(id);
  if (!job) {
    return c.json({ error: 'Universe not found' }, 404);
  }

  // Get stats if complete
  let stats: UniverseStatusResponse['stats'];
  if (job.status === 'complete') {
    const [emails, characters, threads] = await Promise.all([
      ctx.storage.getEmails(id),
      ctx.storage.getCharacters(id),
      ctx.storage.getThreads(id),
    ]);

    stats = {
      documentCount: 0, // Could query this
      characterCount: characters.length,
      emailCount: emails.length,
      threadCount: threads.length,
    };
  }

  const response: UniverseStatusResponse = {
    universeId: id,
    status: job.status,
    progress: job.progress,
    stats,
    error: job.error,
  };

  return c.json(response);
});

// Get emails
app.get('/api/universe/:id/emails', async (c) => {
  const id = c.req.param('id') as UniverseId;
  const folder = c.req.query('folder') as FolderType | undefined;

  try {
    const [emails, threads, characters] = await Promise.all([
      folder
        ? ctx.storage.getEmailsByFolder(id, folder)
        : ctx.storage.getEmails(id),
      ctx.storage.getThreads(id),
      ctx.storage.getCharacters(id),
    ]);

    // Calculate folder counts
    const allEmails = await ctx.storage.getEmails(id);
    const folderCounts = new Map<FolderType, { count: number; unread: number }>();

    for (const email of allEmails) {
      const current = folderCounts.get(email.folder) ?? { count: 0, unread: 0 };
      current.count++;
      if (!email.isRead) current.unread++;
      folderCounts.set(email.folder, current);
    }

    const response: GetEmailsResponse = {
      emails,
      threads,
      characters: characters.map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        email: c.email,
      })),
      folders: [
        { type: 'inbox', count: folderCounts.get('inbox')?.count ?? 0, unreadCount: folderCounts.get('inbox')?.unread ?? 0 },
        { type: 'sent', count: folderCounts.get('sent')?.count ?? 0, unreadCount: 0 },
        { type: 'newsletters', count: folderCounts.get('newsletters')?.count ?? 0, unreadCount: folderCounts.get('newsletters')?.unread ?? 0 },
        { type: 'spam', count: folderCounts.get('spam')?.count ?? 0, unreadCount: folderCounts.get('spam')?.unread ?? 0 },
        { type: 'flagged', count: allEmails.filter((e) => e.isStarred).length, unreadCount: 0 },
        { type: 'trash', count: folderCounts.get('trash')?.count ?? 0, unreadCount: 0 },
      ],
    };

    return c.json(response);
  } catch (error) {
    console.error('Get emails error:', error);
    return c.json({ error: 'Failed to get emails' }, 500);
  }
});

// Get single email
app.get('/api/universe/:id/emails/:emailId', async (c) => {
  const id = c.req.param('id') as UniverseId;
  const emailId = c.req.param('emailId');

  const emails = await ctx.storage.getEmails(id);
  const email = emails.find((e) => e.id === emailId);

  if (!email) {
    return c.json({ error: 'Email not found' }, 404);
  }

  return c.json(email);
});

// Get thread
app.get('/api/universe/:id/threads/:threadId', async (c) => {
  const id = c.req.param('id') as UniverseId;
  const threadId = c.req.param('threadId');

  const threads = await ctx.storage.getThreads(id);
  const thread = threads.find((t) => t.id === threadId);

  if (!thread) {
    return c.json({ error: 'Thread not found' }, 404);
  }

  const emails = await ctx.storage.getEmailsByThread(id, thread.id);

  return c.json({ thread, emails });
});

// Mark email as read
app.patch('/api/universe/:id/emails/:emailId/read', async (c) => {
  const id = c.req.param('id') as UniverseId;
  const emailId = c.req.param('emailId');

  const emails = await ctx.storage.getEmails(id);
  const email = emails.find((e) => e.id === emailId);

  if (!email) {
    return c.json({ error: 'Email not found' }, 404);
  }

  email.isRead = true;
  await ctx.storage.saveEmail(id, email);

  return c.json({ success: true });
});

// Toggle star
app.patch('/api/universe/:id/emails/:emailId/star', async (c) => {
  const id = c.req.param('id') as UniverseId;
  const emailId = c.req.param('emailId');

  const emails = await ctx.storage.getEmails(id);
  const email = emails.find((e) => e.id === emailId);

  if (!email) {
    return c.json({ error: 'Email not found' }, 404);
  }

  email.isStarred = !email.isStarred;
  await ctx.storage.saveEmail(id, email);

  return c.json({ success: true, isStarred: email.isStarred });
});

// Get characters
app.get('/api/universe/:id/characters', async (c) => {
  const id = c.req.param('id') as UniverseId;

  const characters = await ctx.storage.getCharacters(id);

  return c.json(characters);
});

// Serve static files (UI)
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EmailVerse - Recovered Archive</title>
  <link rel="stylesheet" href="/static/theme.css">
</head>
<body>
  <email-app></email-app>
  <script type="module" src="/static/app.js"></script>
</body>
</html>`);
});

// Serve static CSS
app.get('/static/theme.css', async (c) => {
  const fs = await import('fs/promises');
  const path = await import('path');
  const __dirname = path.dirname(new URL(import.meta.url).pathname);
  const cssPath = path.join(__dirname, '..', 'ui', 'static', 'theme.css');
  try {
    const css = await fs.readFile(cssPath, 'utf-8');
    return c.text(css, 200, { 'Content-Type': 'text/css' });
  } catch {
    return c.text('/* CSS not found */', 404);
  }
});

// Serve static JS
app.get('/static/app.js', async (c) => {
  const fs = await import('fs/promises');
  const path = await import('path');
  const __dirname = path.dirname(new URL(import.meta.url).pathname);
  const jsPath = path.join(__dirname, '..', 'ui', 'static', 'app.js');
  try {
    const js = await fs.readFile(jsPath, 'utf-8');
    return c.text(js, 200, { 'Content-Type': 'application/javascript' });
  } catch {
    return c.text('// JS not found', 404);
  }
});

// =============================================================================
// GENERATION LOGIC
// =============================================================================

async function generateUniverse(
  universeId: UniverseId,
  documents: CreateUniverseRequest['documents'],
  config: WorldConfig
): Promise<void> {
  const job = ctx.generationJobs.get(universeId)!;

  try {
    // Phase 1: Process documents
    job.progress = {
      phase: 'documents',
      percentComplete: 10,
      currentTask: 'Chunking and extracting entities',
    };
    await ctx.storage.updateUniverseStatus(universeId, job.progress);

    const rawDocs: RawDocument[] = documents.map((d) => ({
      id: uuid() as DocumentId,
      filename: d.filename,
      mimeType: d.mimeType,
      content: d.content,
      uploadedAt: new Date(),
    }));

    const processedDocs = await processDocuments(rawDocs, ctx.router);

    for (const doc of processedDocs) {
      await ctx.storage.saveDocument(universeId, doc);
    }

    job.progress.percentComplete = 30;

    // Phase 2: Generate characters
    job.progress = {
      phase: 'characters',
      percentComplete: 35,
      currentTask: 'Generating characters',
    };
    await ctx.storage.updateUniverseStatus(universeId, job.progress);

    const allEntities = processedDocs.flatMap((d) => d.extractedEntities);
    const allThemes = processedDocs.flatMap((d) => d.themes);

    const characters = await generateCharacters(
      allEntities,
      allThemes,
      {
        min: config.characterCount.min,
        max: config.characterCount.max,
        archetypes: config.extrinsicArchetypes,
      },
      ctx.router
    );

    for (const char of characters) {
      await ctx.storage.saveCharacter(universeId, char);
    }

    job.progress.percentComplete = 50;

    // Infer relationships
    job.progress.currentTask = 'Inferring relationships';
    const allChunks = processedDocs.flatMap((d) => d.chunks);
    const relationships = await inferRelationships(allEntities, allChunks, ctx.router);

    for (const rel of relationships) {
      await ctx.storage.saveRelationship(universeId, {
        id: uuid(),
        participants: [rel.entity1 as any, rel.entity2 as any],
        type: rel.type as any,
        strength: rel.strength,
        sentiment: 0,
      });
    }

    // Initialize tensions
    const tensions = await initializeTensions(allThemes, characters, ctx.router);
    for (const tension of tensions) {
      await ctx.storage.saveTension(universeId, tension);
    }

    job.progress.percentComplete = 60;

    // Phase 3: Run simulation
    job.progress = {
      phase: 'simulation',
      percentComplete: 65,
      currentTask: 'Generating emails',
    };
    await ctx.storage.updateUniverseStatus(universeId, job.progress);

    // Get full world state
    const storedRelationships = await ctx.storage.getRelationships(universeId);
    const storedTensions = await ctx.storage.getTensions(universeId);
    const storedFacts = await ctx.storage.getFacts(universeId);
    const storedEvents = await ctx.storage.getEvents(universeId);

    const worldState = {
      id: universeId,
      createdAt: new Date(),
      lastTickAt: new Date(),
      tickCount: 0,
      simulatedTimeStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 1 week ago
      simulatedTimeCurrent: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      characters,
      relationships: storedRelationships,
      tensions: storedTensions,
      facts: storedFacts,
      events: storedEvents,
      emails: [],
      documents: processedDocs,
      config,
    };

    const { world: finalWorld } = await runSimulation(
      worldState,
      ctx.router,
      {
        targetEmails: config.targetEmailCount,
        timeoutMs: 5 * 60 * 1000, // 5 minute timeout
        onTick: async (result) => {
          const emailCount = finalWorld?.emails.length ?? result.newEmails.length;
          const progress = Math.min(95, 65 + (emailCount / config.targetEmailCount) * 30);
          job.progress = {
            phase: 'simulation',
            percentComplete: Math.round(progress),
            currentTask: `Generated ${emailCount} emails`,
          };
          await ctx.storage.updateUniverseStatus(universeId, job.progress);
        },
      }
    );

    // Save all generated content
    for (const email of finalWorld.emails) {
      await ctx.storage.saveEmail(universeId, email);
    }

    for (const event of finalWorld.events) {
      await ctx.storage.saveEvent(universeId, event);
    }

    // Build and save threads
    const threadMap = new Map<string, Email[]>();
    for (const email of finalWorld.emails) {
      const existing = threadMap.get(email.threadId) ?? [];
      existing.push(email);
      threadMap.set(email.threadId, existing);
    }

    for (const [threadId, emails] of threadMap) {
      const sorted = emails.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
      const thread: Thread = {
        id: threadId as any,
        subject: sorted[0].subject,
        participants: [...new Set(sorted.flatMap((e) => [e.from.characterId, ...e.to.map((t) => t.characterId)]))],
        emails: sorted.map((e) => e.id),
        startedAt: sorted[0].sentAt,
        lastActivityAt: sorted[sorted.length - 1].sentAt,
        messageCount: sorted.length,
        relatedTensions: [],
      };
      await ctx.storage.saveThread(universeId, thread);
    }

    // Update world state
    await ctx.storage.updateUniverse(finalWorld);

    // Complete
    job.status = 'complete';
    job.progress = {
      phase: 'complete',
      percentComplete: 100,
      currentTask: 'Done',
    };
    job.completedAt = new Date();
    await ctx.storage.updateUniverseStatus(universeId, job.progress);

    console.log(`Universe ${universeId} generated: ${finalWorld.emails.length} emails`);
  } catch (error) {
    console.error('Generation error:', error);
    job.status = 'failed';
    job.error = (error as Error).message;
    throw error;
  }
}

// =============================================================================
// SERVER START
// =============================================================================

const port = parseInt(process.env.PORT ?? '3000', 10);

export function startServer(): void {
  ctx = initContext();

  serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      console.log(`EmailVerse server running at http://localhost:${info.port}`);
      console.log(`Available models: ${ctx.router.getAvailableModels().join(', ')}`);
    }
  );
}

export { app, ctx };
