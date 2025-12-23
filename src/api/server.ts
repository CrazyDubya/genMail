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
    subTask?: string;
    itemsProcessed?: number;
    itemsTotal?: number;
  };
  error?: string;
  errorDetails?: string;
  startedAt: Date;
  completedAt?: Date;
  cost?: {
    totalCost: number;
    totalTokens: number;
    callCount: number;
  };
  lastActivityAt?: Date;
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

// Session middleware - creates or validates session token
app.use('/api/*', async (c, next) => {
  // Skip session check for session creation endpoint
  if (c.req.path === '/api/session') {
    return next();
  }

  const token = c.req.header('X-Session-Token');

  if (token) {
    const session = await ctx.storage.getSessionByToken(token);
    if (session) {
      c.set('sessionId', session.id);
      // Update activity timestamp (don't await to not slow down requests)
      ctx.storage.updateSessionActivity(session.id);
      return next();
    }
  }

  // No valid session - return error for protected endpoints
  // But allow universe status checks for backward compatibility
  if (c.req.path.includes('/status')) {
    return next();
  }

  return c.json({ error: 'Session required. Get a session token from POST /api/session' }, 401);
});

// JSON body parser is built into Hono

// =============================================================================
// API ROUTES
// =============================================================================

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =============================================================================
// SESSION & MAILBOX ROUTES
// =============================================================================

// Create or get session
app.post('/api/session', async (c) => {
  try {
    // Check if token provided - if valid, return existing session info
    const existingToken = c.req.header('X-Session-Token');
    if (existingToken) {
      const existing = await ctx.storage.getSessionByToken(existingToken);
      if (existing) {
        const mailboxes = await ctx.storage.getSessionUniverses(existing.id);
        return c.json({
          sessionId: existing.id,
          token: existingToken,
          createdAt: existing.createdAt.toISOString(),
          mailboxes,
        });
      }
    }

    // Create new session
    const { sessionId, token } = await ctx.storage.createSession();

    return c.json({
      sessionId,
      token,
      createdAt: new Date().toISOString(),
      mailboxes: [],
    }, 201);
  } catch (error) {
    console.error('Create session error:', error);
    return c.json({ error: 'Failed to create session' }, 500);
  }
});

// Get mailboxes for current session
app.get('/api/mailboxes', async (c) => {
  const sessionId = c.get('sessionId');
  if (!sessionId) {
    return c.json({ error: 'Session required' }, 401);
  }

  try {
    const mailboxes = await ctx.storage.getSessionUniverses(sessionId);

    // Add generation job status for processing mailboxes
    const mailboxesWithStatus = mailboxes.map((mb) => {
      const job = ctx.generationJobs.get(mb.universeId);
      return {
        ...mb,
        generationStatus: job ? {
          status: job.status,
          progress: job.progress,
        } : null,
      };
    });

    return c.json({ mailboxes: mailboxesWithStatus });
  } catch (error) {
    console.error('Get mailboxes error:', error);
    return c.json({ error: 'Failed to get mailboxes' }, 500);
  }
});

// Switch to a different mailbox
app.post('/api/mailboxes/:id/activate', async (c) => {
  const sessionId = c.get('sessionId');
  if (!sessionId) {
    return c.json({ error: 'Session required' }, 401);
  }

  const universeId = c.req.param('id') as UniverseId;

  try {
    // Verify ownership
    const isOwned = await ctx.storage.isUniverseOwnedBySession(sessionId, universeId);
    if (!isOwned) {
      return c.json({ error: 'Mailbox not found' }, 404);
    }

    await ctx.storage.setActiveUniverse(sessionId, universeId);

    return c.json({ success: true, activeUniverseId: universeId });
  } catch (error) {
    console.error('Activate mailbox error:', error);
    return c.json({ error: 'Failed to activate mailbox' }, 500);
  }
});

// Rename a mailbox
app.patch('/api/mailboxes/:id', async (c) => {
  const sessionId = c.get('sessionId');
  if (!sessionId) {
    return c.json({ error: 'Session required' }, 401);
  }

  const universeId = c.req.param('id') as UniverseId;
  const body = await c.req.json<{ name: string }>();

  try {
    const isOwned = await ctx.storage.isUniverseOwnedBySession(sessionId, universeId);
    if (!isOwned) {
      return c.json({ error: 'Mailbox not found' }, 404);
    }

    await ctx.storage.renameUniverse(sessionId, universeId, body.name);

    return c.json({ success: true });
  } catch (error) {
    console.error('Rename mailbox error:', error);
    return c.json({ error: 'Failed to rename mailbox' }, 500);
  }
});

// Delete a mailbox
app.delete('/api/mailboxes/:id', async (c) => {
  const sessionId = c.get('sessionId');
  if (!sessionId) {
    return c.json({ error: 'Session required' }, 401);
  }

  const universeId = c.req.param('id') as UniverseId;

  try {
    const isOwned = await ctx.storage.isUniverseOwnedBySession(sessionId, universeId);
    if (!isOwned) {
      return c.json({ error: 'Mailbox not found' }, 404);
    }

    await ctx.storage.deleteUniverseFromSession(sessionId, universeId);

    // Remove from generation jobs if present
    ctx.generationJobs.delete(universeId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete mailbox error:', error);
    return c.json({ error: 'Failed to delete mailbox' }, 500);
  }
});

// =============================================================================
// UNIVERSE ROUTES
// =============================================================================

// Create universe
app.post('/api/universe', async (c) => {
  try {
    const sessionId = c.get('sessionId');
    if (!sessionId) {
      return c.json({ error: 'Session required' }, 401);
    }

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

    // Link universe to session with optional name
    const mailboxName = body.documents[0]?.filename?.replace(/\.[^.]+$/, '') ?? 'New Mailbox';
    await ctx.storage.addUniverseToSession(sessionId, universeId, mailboxName);

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

  // Calculate elapsed time
  const elapsedMs = Date.now() - job.startedAt.getTime();
  const elapsedSec = Math.floor(elapsedMs / 1000);

  // Get current cost from router
  const usage = ctx.router.getCumulativeUsage();

  const response = {
    universeId: id,
    status: job.status,
    progress: {
      ...job.progress,
      elapsedSeconds: elapsedSec,
    },
    stats,
    error: job.error,
    errorDetails: job.errorDetails,
    cost: {
      totalCost: usage.totalCost,
      totalTokens: usage.totalInputTokens + usage.totalOutputTokens,
      callCount: usage.callCount,
    },
    lastActivityAt: job.lastActivityAt?.toISOString(),
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

  // Helper to update progress with activity timestamp
  const updateProgress = async (
    phase: GenerationJob['progress']['phase'],
    percentComplete: number,
    currentTask: string,
    subTask?: string,
    itemsProcessed?: number,
    itemsTotal?: number
  ) => {
    job.progress = { phase, percentComplete, currentTask, subTask, itemsProcessed, itemsTotal };
    job.lastActivityAt = new Date();
    await ctx.storage.updateUniverseStatus(universeId, job.progress);
    console.log(`[Generation ${universeId.slice(0, 8)}] ${percentComplete}% - ${currentTask}${subTask ? `: ${subTask}` : ''}`);
  };

  try {
    // Phase 1: Process documents
    await updateProgress('documents', 5, 'Processing documents', 'Initializing...', 0, documents.length);

    console.log(`[Generation ${universeId.slice(0, 8)}] Starting with ${documents.length} document(s)`);

    const rawDocs: RawDocument[] = documents.map((d) => ({
      id: uuid() as DocumentId,
      filename: d.filename,
      mimeType: d.mimeType,
      content: d.content,
      uploadedAt: new Date(),
    }));

    await updateProgress('documents', 10, 'Processing documents', 'Chunking and extracting entities...', 0, rawDocs.length);

    const processedDocs = await processDocuments(rawDocs, ctx.router);

    await updateProgress('documents', 20, 'Processing documents', 'Saving processed documents...', processedDocs.length, processedDocs.length);

    for (const doc of processedDocs) {
      await ctx.storage.saveDocument(universeId, doc);
    }

    await updateProgress('documents', 30, 'Processing documents', 'Document processing complete', processedDocs.length, processedDocs.length);

    // Phase 2: Generate characters
    await updateProgress('characters', 32, 'Generating characters', 'Analyzing entities...', 0, 0);

    const allEntities = processedDocs.flatMap((d) => d.extractedEntities);
    const allThemes = processedDocs.flatMap((d) => d.themes);

    console.log(`[Generation ${universeId.slice(0, 8)}] Found ${allEntities.length} entities, ${allThemes.length} themes`);

    await updateProgress('characters', 35, 'Generating characters', `Creating ${config.characterCount.min}-${config.characterCount.max} characters...`, 0, config.characterCount.max);

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

    await updateProgress('characters', 45, 'Generating characters', 'Saving characters...', characters.length, characters.length);

    for (const char of characters) {
      await ctx.storage.saveCharacter(universeId, char);
    }

    console.log(`[Generation ${universeId.slice(0, 8)}] Created ${characters.length} characters`);

    // Infer relationships
    await updateProgress('characters', 48, 'Building relationships', 'Inferring character relationships...', 0, characters.length);

    const allChunks = processedDocs.flatMap((d) => d.chunks);
    const relationships = await inferRelationships(allEntities, allChunks, ctx.router);

    await updateProgress('characters', 52, 'Building relationships', `Saving ${relationships.length} relationships...`, relationships.length, relationships.length);

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
    await updateProgress('characters', 55, 'Initializing tensions', 'Creating dramatic tensions...', 0, 0);

    const tensions = await initializeTensions(allThemes, characters, ctx.router);
    for (const tension of tensions) {
      await ctx.storage.saveTension(universeId, tension);
    }

    await updateProgress('characters', 60, 'Character setup complete', `${characters.length} characters, ${relationships.length} relationships, ${tensions.length} tensions`, 0, 0);

    console.log(`[Generation ${universeId.slice(0, 8)}] Created ${tensions.length} tensions`);

    // Phase 3: Run simulation
    await updateProgress('simulation', 62, 'Running simulation', 'Initializing world state...', 0, config.targetEmailCount);

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

    await updateProgress('simulation', 65, 'Running simulation', 'Starting email generation...', 0, config.targetEmailCount);

    let totalEmailsGenerated = 0;
    const { world: finalWorld } = await runSimulation(
      worldState,
      ctx.router,
      {
        targetEmails: config.targetEmailCount,
        timeoutMs: 5 * 60 * 1000, // 5 minute timeout
        onTick: async (result) => {
          totalEmailsGenerated += result.newEmails.length;
          const emailCount = totalEmailsGenerated;
          const progress = Math.min(95, 65 + (emailCount / config.targetEmailCount) * 30);
          const usage = ctx.router.getCumulativeUsage();
          await updateProgress(
            'simulation',
            Math.round(progress),
            'Generating emails',
            `${emailCount}/${config.targetEmailCount} emails generated`,
            emailCount,
            config.targetEmailCount
          );
          // Log cost periodically
          if (emailCount % 10 === 0) {
            console.log(`[Generation ${universeId.slice(0, 8)}] Cost so far: $${usage.totalCost.toFixed(4)} (${usage.callCount} API calls)`);
          }
        },
      }
    );

    // Save all generated content
    await updateProgress('simulation', 96, 'Saving results', 'Saving emails...', finalWorld.emails.length, finalWorld.emails.length);

    for (const email of finalWorld.emails) {
      await ctx.storage.saveEmail(universeId, email);
    }

    for (const event of finalWorld.events) {
      await ctx.storage.saveEvent(universeId, event);
    }

    // Build and save threads
    await updateProgress('simulation', 97, 'Saving results', 'Building email threads...', 0, 0);

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
    await updateProgress('simulation', 99, 'Finalizing', 'Updating world state...', 0, 0);
    await ctx.storage.updateUniverse(finalWorld);

    // Get final cost summary
    const finalUsage = ctx.router.getCumulativeUsage();
    job.cost = {
      totalCost: finalUsage.totalCost,
      totalTokens: finalUsage.totalInputTokens + finalUsage.totalOutputTokens,
      callCount: finalUsage.callCount,
    };

    // Complete
    job.status = 'complete';
    job.progress = {
      phase: 'complete',
      percentComplete: 100,
      currentTask: 'Generation complete',
      subTask: `${finalWorld.emails.length} emails, ${threadMap.size} threads`,
    };
    job.completedAt = new Date();
    job.lastActivityAt = new Date();
    await ctx.storage.updateUniverseStatus(universeId, job.progress);

    // Log final summary
    console.log(`\n[Generation ${universeId.slice(0, 8)}] COMPLETE`);
    console.log(`  Emails: ${finalWorld.emails.length}`);
    console.log(`  Threads: ${threadMap.size}`);
    console.log(`  Characters: ${characters.length}`);
    console.log(`  Duration: ${((job.completedAt.getTime() - job.startedAt.getTime()) / 1000).toFixed(1)}s`);
    console.log(ctx.router.getCostSummary());

  } catch (error) {
    const errorMessage = (error as Error).message;
    const errorStack = (error as Error).stack;

    console.error(`\n[Generation ${universeId.slice(0, 8)}] FAILED`);
    console.error(`  Error: ${errorMessage}`);
    console.error(`  Stack: ${errorStack}`);

    // Log cost even on failure
    const usage = ctx.router.getCumulativeUsage();
    console.log(`  Cost incurred: $${usage.totalCost.toFixed(4)} (${usage.callCount} API calls)`);

    job.status = 'failed';
    job.error = errorMessage;
    job.errorDetails = errorStack;
    job.lastActivityAt = new Date();
    job.cost = {
      totalCost: usage.totalCost,
      totalTokens: usage.totalInputTokens + usage.totalOutputTokens,
      callCount: usage.callCount,
    };

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
