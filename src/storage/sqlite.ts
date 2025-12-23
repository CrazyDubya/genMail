/**
 * SQLite Storage Implementation
 *
 * Local storage using better-sqlite3 for development.
 * Same interface can be implemented with D1 for Cloudflare.
 */

import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type {
  UniverseId,
  DocumentId,
  ThreadId,
  WorldState,
  ProcessedDocument,
  Character,
  Email,
  Thread,
  Tension,
  Relationship,
  Fact,
  SimulatedEvent,
  WorldConfig,
} from '../types.js';

export interface Storage {
  // Universe operations
  createUniverse(config: WorldConfig): Promise<UniverseId>;
  getUniverse(id: UniverseId): Promise<WorldState | null>;
  updateUniverse(state: WorldState): Promise<void>;
  deleteUniverse(id: UniverseId): Promise<void>;

  // Document operations
  saveDocument(universeId: UniverseId, doc: ProcessedDocument): Promise<void>;
  getDocuments(universeId: UniverseId): Promise<ProcessedDocument[]>;

  // Character operations
  saveCharacter(universeId: UniverseId, char: Character): Promise<void>;
  getCharacters(universeId: UniverseId): Promise<Character[]>;
  updateCharacter(universeId: UniverseId, char: Character): Promise<void>;

  // Email operations
  saveEmail(universeId: UniverseId, email: Email): Promise<void>;
  getEmails(universeId: UniverseId): Promise<Email[]>;
  getEmailsByFolder(universeId: UniverseId, folder: string): Promise<Email[]>;
  getEmailsByThread(universeId: UniverseId, threadId: ThreadId): Promise<Email[]>;

  // Thread operations
  saveThread(universeId: UniverseId, thread: Thread): Promise<void>;
  getThreads(universeId: UniverseId): Promise<Thread[]>;

  // Tension operations
  saveTension(universeId: UniverseId, tension: Tension): Promise<void>;
  getTensions(universeId: UniverseId): Promise<Tension[]>;
  updateTension(universeId: UniverseId, tension: Tension): Promise<void>;

  // Relationship operations
  saveRelationship(universeId: UniverseId, rel: Relationship): Promise<void>;
  getRelationships(universeId: UniverseId): Promise<Relationship[]>;

  // Event operations
  saveEvent(universeId: UniverseId, event: SimulatedEvent): Promise<void>;
  getEvents(universeId: UniverseId): Promise<SimulatedEvent[]>;

  // Fact operations
  saveFact(universeId: UniverseId, fact: Fact): Promise<void>;
  getFacts(universeId: UniverseId): Promise<Fact[]>;

  // Status
  getUniverseStatus(id: UniverseId): Promise<{
    phase: string;
    percentComplete: number;
    currentTask?: string;
  } | null>;
  updateUniverseStatus(
    id: UniverseId,
    status: { phase: string; percentComplete: number; currentTask?: string }
  ): Promise<void>;
}

export class SQLiteStorage implements Storage {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      -- Universes table
      CREATE TABLE IF NOT EXISTS universes (
        id TEXT PRIMARY KEY,
        config TEXT NOT NULL,
        status_phase TEXT DEFAULT 'documents',
        status_percent INTEGER DEFAULT 0,
        status_task TEXT,
        tick_count INTEGER DEFAULT 0,
        simulated_time_start TEXT,
        simulated_time_current TEXT,
        created_at TEXT NOT NULL,
        last_tick_at TEXT
      );

      -- Documents table
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        universe_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        content TEXT NOT NULL,
        chunks TEXT NOT NULL,
        entities TEXT NOT NULL,
        themes TEXT NOT NULL,
        metadata TEXT NOT NULL,
        uploaded_at TEXT NOT NULL,
        FOREIGN KEY (universe_id) REFERENCES universes(id) ON DELETE CASCADE
      );

      -- Characters table
      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        universe_id TEXT NOT NULL,
        data TEXT NOT NULL,
        FOREIGN KEY (universe_id) REFERENCES universes(id) ON DELETE CASCADE
      );

      -- Emails table
      CREATE TABLE IF NOT EXISTS emails (
        id TEXT PRIMARY KEY,
        universe_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        folder TEXT NOT NULL,
        sent_at TEXT NOT NULL,
        data TEXT NOT NULL,
        FOREIGN KEY (universe_id) REFERENCES universes(id) ON DELETE CASCADE
      );

      -- Threads table
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        universe_id TEXT NOT NULL,
        data TEXT NOT NULL,
        FOREIGN KEY (universe_id) REFERENCES universes(id) ON DELETE CASCADE
      );

      -- Tensions table
      CREATE TABLE IF NOT EXISTS tensions (
        id TEXT PRIMARY KEY,
        universe_id TEXT NOT NULL,
        status TEXT NOT NULL,
        data TEXT NOT NULL,
        FOREIGN KEY (universe_id) REFERENCES universes(id) ON DELETE CASCADE
      );

      -- Relationships table
      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY,
        universe_id TEXT NOT NULL,
        data TEXT NOT NULL,
        FOREIGN KEY (universe_id) REFERENCES universes(id) ON DELETE CASCADE
      );

      -- Events table
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        universe_id TEXT NOT NULL,
        tick INTEGER NOT NULL,
        data TEXT NOT NULL,
        FOREIGN KEY (universe_id) REFERENCES universes(id) ON DELETE CASCADE
      );

      -- Facts table
      CREATE TABLE IF NOT EXISTS facts (
        id TEXT PRIMARY KEY,
        universe_id TEXT NOT NULL,
        data TEXT NOT NULL,
        FOREIGN KEY (universe_id) REFERENCES universes(id) ON DELETE CASCADE
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_documents_universe ON documents(universe_id);
      CREATE INDEX IF NOT EXISTS idx_characters_universe ON characters(universe_id);
      CREATE INDEX IF NOT EXISTS idx_emails_universe ON emails(universe_id);
      CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(universe_id, folder);
      CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(universe_id, thread_id);
      CREATE INDEX IF NOT EXISTS idx_threads_universe ON threads(universe_id);
      CREATE INDEX IF NOT EXISTS idx_tensions_universe ON tensions(universe_id);
      CREATE INDEX IF NOT EXISTS idx_events_universe ON events(universe_id);
      CREATE INDEX IF NOT EXISTS idx_facts_universe ON facts(universe_id);
    `);
  }

  // Universe operations
  async createUniverse(config: WorldConfig): Promise<UniverseId> {
    const id = uuid() as UniverseId;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO universes (id, config, created_at, simulated_time_start, simulated_time_current, last_tick_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, JSON.stringify(config), now, now, now, now);

    return id;
  }

  async getUniverse(id: UniverseId): Promise<WorldState | null> {
    const row = this.db
      .prepare('SELECT * FROM universes WHERE id = ?')
      .get(id) as {
      id: string;
      config: string;
      tick_count: number;
      simulated_time_start: string;
      simulated_time_current: string;
      created_at: string;
      last_tick_at: string;
    } | undefined;

    if (!row) return null;

    const [documents, characters, emails, threads, tensions, relationships, events, facts] =
      await Promise.all([
        this.getDocuments(id),
        this.getCharacters(id),
        this.getEmails(id),
        this.getThreads(id),
        this.getTensions(id),
        this.getRelationships(id),
        this.getEvents(id),
        this.getFacts(id),
      ]);

    return {
      id,
      config: JSON.parse(row.config),
      tickCount: row.tick_count,
      simulatedTimeStart: new Date(row.simulated_time_start),
      simulatedTimeCurrent: new Date(row.simulated_time_current),
      createdAt: new Date(row.created_at),
      lastTickAt: new Date(row.last_tick_at),
      documents,
      characters,
      emails,
      threads,
      tensions,
      relationships,
      events,
      facts,
    } as unknown as WorldState;
  }

  async updateUniverse(state: WorldState): Promise<void> {
    this.db
      .prepare(
        `UPDATE universes SET
         tick_count = ?,
         simulated_time_current = ?,
         last_tick_at = ?
         WHERE id = ?`
      )
      .run(
        state.tickCount,
        state.simulatedTimeCurrent.toISOString(),
        state.lastTickAt.toISOString(),
        state.id
      );
  }

  async deleteUniverse(id: UniverseId): Promise<void> {
    this.db.prepare('DELETE FROM universes WHERE id = ?').run(id);
  }

  // Document operations
  async saveDocument(universeId: UniverseId, doc: ProcessedDocument): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO documents
         (id, universe_id, filename, mime_type, content, chunks, entities, themes, metadata, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        doc.id,
        universeId,
        doc.raw.filename,
        doc.raw.mimeType,
        doc.raw.content,
        JSON.stringify(doc.chunks),
        JSON.stringify(doc.extractedEntities),
        JSON.stringify(doc.themes),
        JSON.stringify(doc.processingMetadata),
        doc.raw.uploadedAt.toISOString()
      );
  }

  async getDocuments(universeId: UniverseId): Promise<ProcessedDocument[]> {
    const rows = this.db
      .prepare('SELECT * FROM documents WHERE universe_id = ?')
      .all(universeId) as Array<{
      id: string;
      filename: string;
      mime_type: string;
      content: string;
      chunks: string;
      entities: string;
      themes: string;
      metadata: string;
      uploaded_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id as DocumentId,
      raw: {
        id: row.id as DocumentId,
        filename: row.filename,
        mimeType: row.mime_type,
        content: row.content,
        uploadedAt: new Date(row.uploaded_at),
      },
      chunks: JSON.parse(row.chunks),
      extractedEntities: JSON.parse(row.entities),
      themes: JSON.parse(row.themes),
      processingMetadata: JSON.parse(row.metadata),
    }));
  }

  // Character operations
  async saveCharacter(universeId: UniverseId, char: Character): Promise<void> {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO characters (id, universe_id, data) VALUES (?, ?, ?)'
      )
      .run(char.id, universeId, JSON.stringify(char));
  }

  async getCharacters(universeId: UniverseId): Promise<Character[]> {
    const rows = this.db
      .prepare('SELECT data FROM characters WHERE universe_id = ?')
      .all(universeId) as Array<{ data: string }>;

    return rows.map((row) => JSON.parse(row.data));
  }

  async updateCharacter(universeId: UniverseId, char: Character): Promise<void> {
    await this.saveCharacter(universeId, char);
  }

  // Email operations
  async saveEmail(universeId: UniverseId, email: Email): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO emails
         (id, universe_id, thread_id, folder, sent_at, data)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        email.id,
        universeId,
        email.threadId,
        email.folder,
        email.sentAt.toISOString(),
        JSON.stringify(email)
      );
  }

  async getEmails(universeId: UniverseId): Promise<Email[]> {
    const rows = this.db
      .prepare('SELECT data FROM emails WHERE universe_id = ? ORDER BY sent_at')
      .all(universeId) as Array<{ data: string }>;

    return rows.map((row) => {
      const email = JSON.parse(row.data);
      email.sentAt = new Date(email.sentAt);
      email.generatedAt = new Date(email.generatedAt);
      return email;
    });
  }

  async getEmailsByFolder(universeId: UniverseId, folder: string): Promise<Email[]> {
    const rows = this.db
      .prepare(
        'SELECT data FROM emails WHERE universe_id = ? AND folder = ? ORDER BY sent_at DESC'
      )
      .all(universeId, folder) as Array<{ data: string }>;

    return rows.map((row) => {
      const email = JSON.parse(row.data);
      email.sentAt = new Date(email.sentAt);
      email.generatedAt = new Date(email.generatedAt);
      return email;
    });
  }

  async getEmailsByThread(universeId: UniverseId, threadId: ThreadId): Promise<Email[]> {
    const rows = this.db
      .prepare(
        'SELECT data FROM emails WHERE universe_id = ? AND thread_id = ? ORDER BY sent_at'
      )
      .all(universeId, threadId) as Array<{ data: string }>;

    return rows.map((row) => {
      const email = JSON.parse(row.data);
      email.sentAt = new Date(email.sentAt);
      email.generatedAt = new Date(email.generatedAt);
      return email;
    });
  }

  // Thread operations
  async saveThread(universeId: UniverseId, thread: Thread): Promise<void> {
    this.db
      .prepare('INSERT OR REPLACE INTO threads (id, universe_id, data) VALUES (?, ?, ?)')
      .run(thread.id, universeId, JSON.stringify(thread));
  }

  async getThreads(universeId: UniverseId): Promise<Thread[]> {
    const rows = this.db
      .prepare('SELECT data FROM threads WHERE universe_id = ?')
      .all(universeId) as Array<{ data: string }>;

    return rows.map((row) => {
      const thread = JSON.parse(row.data);
      thread.startedAt = new Date(thread.startedAt);
      thread.lastActivityAt = new Date(thread.lastActivityAt);
      return thread;
    });
  }

  // Tension operations
  async saveTension(universeId: UniverseId, tension: Tension): Promise<void> {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO tensions (id, universe_id, status, data) VALUES (?, ?, ?, ?)'
      )
      .run(tension.id, universeId, tension.status, JSON.stringify(tension));
  }

  async getTensions(universeId: UniverseId): Promise<Tension[]> {
    const rows = this.db
      .prepare('SELECT data FROM tensions WHERE universe_id = ?')
      .all(universeId) as Array<{ data: string }>;

    return rows.map((row) => JSON.parse(row.data));
  }

  async updateTension(universeId: UniverseId, tension: Tension): Promise<void> {
    await this.saveTension(universeId, tension);
  }

  // Relationship operations
  async saveRelationship(universeId: UniverseId, rel: Relationship): Promise<void> {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO relationships (id, universe_id, data) VALUES (?, ?, ?)'
      )
      .run(rel.id, universeId, JSON.stringify(rel));
  }

  async getRelationships(universeId: UniverseId): Promise<Relationship[]> {
    const rows = this.db
      .prepare('SELECT data FROM relationships WHERE universe_id = ?')
      .all(universeId) as Array<{ data: string }>;

    return rows.map((row) => JSON.parse(row.data));
  }

  // Event operations
  async saveEvent(universeId: UniverseId, event: SimulatedEvent): Promise<void> {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO events (id, universe_id, tick, data) VALUES (?, ?, ?, ?)'
      )
      .run(event.id, universeId, event.tick, JSON.stringify(event));
  }

  async getEvents(universeId: UniverseId): Promise<SimulatedEvent[]> {
    const rows = this.db
      .prepare('SELECT data FROM events WHERE universe_id = ? ORDER BY tick')
      .all(universeId) as Array<{ data: string }>;

    return rows.map((row) => {
      const event = JSON.parse(row.data);
      event.simulatedTime = new Date(event.simulatedTime);
      return event;
    });
  }

  // Fact operations
  async saveFact(universeId: UniverseId, fact: Fact): Promise<void> {
    this.db
      .prepare('INSERT OR REPLACE INTO facts (id, universe_id, data) VALUES (?, ?, ?)')
      .run(fact.id, universeId, JSON.stringify(fact));
  }

  async getFacts(universeId: UniverseId): Promise<Fact[]> {
    const rows = this.db
      .prepare('SELECT data FROM facts WHERE universe_id = ?')
      .all(universeId) as Array<{ data: string }>;

    return rows.map((row) => JSON.parse(row.data));
  }

  // Status operations
  async getUniverseStatus(id: UniverseId): Promise<{
    phase: string;
    percentComplete: number;
    currentTask?: string;
  } | null> {
    const row = this.db
      .prepare(
        'SELECT status_phase, status_percent, status_task FROM universes WHERE id = ?'
      )
      .get(id) as {
      status_phase: string;
      status_percent: number;
      status_task: string | null;
    } | undefined;

    if (!row) return null;

    return {
      phase: row.status_phase,
      percentComplete: row.status_percent,
      currentTask: row.status_task ?? undefined,
    };
  }

  async updateUniverseStatus(
    id: UniverseId,
    status: { phase: string; percentComplete: number; currentTask?: string }
  ): Promise<void> {
    this.db
      .prepare(
        'UPDATE universes SET status_phase = ?, status_percent = ?, status_task = ? WHERE id = ?'
      )
      .run(status.phase, status.percentComplete, status.currentTask ?? null, id);
  }

  close(): void {
    this.db.close();
  }
}

// Factory function
export function createStorage(dbPath?: string): Storage {
  return new SQLiteStorage(dbPath);
}
