/**
 * EmailVerse - Main Entry Points
 */

export * from './types.js';
export { createStorage, SQLiteStorage, type Storage } from './storage/sqlite.js';
export { createModelRouter, ModelRouter } from './models/router.js';
export { processDocuments, processDocument, chunkDocument, extractFromChunks, inferRelationships } from './pipeline/documents.js';
export { generateCharacters, generateIntrinsicCharacter, generateExtrinsicCharacter } from './pipeline/characters.js';
export { runSimulation, initializeTensions } from './simulation/tick.js';
export { startServer, app } from './api/server.js';
