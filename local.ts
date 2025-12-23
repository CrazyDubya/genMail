/**
 * LocalTaskQueue - In-memory task queue for local development
 * 
 * This is the local implementation of the task queue abstraction.
 * Same interface works with Cloudflare Queues in production.
 */

import { EventEmitter } from 'events';

// =============================================================================
// TYPES
// =============================================================================

export type TaskStatus = 'pending' | 'blocked' | 'running' | 'complete' | 'failed';

export interface Task<TPayload = unknown, TResult = unknown> {
  id: string;
  type: string;
  payload: TPayload;
  dependencies: string[];
  status: TaskStatus;
  priority: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: TResult;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export type TaskHandler<TPayload = unknown, TResult = unknown> = (
  payload: TPayload,
  context: TaskContext
) => Promise<TResult>;

export interface TaskContext {
  taskId: string;
  taskType: string;
  attempt: number;
  emit: (event: string, data: unknown) => void;
}

export interface QueueOptions {
  maxConcurrent?: number;
  defaultMaxRetries?: number;
  pollIntervalMs?: number;
}

export interface TaskQueue {
  enqueue<TPayload, TResult>(
    type: string,
    payload: TPayload,
    options?: EnqueueOptions
  ): Promise<string>;
  
  onComplete<TResult>(taskId: string): Promise<TResult>;
  
  getTask(taskId: string): Task | undefined;
  
  getTasks(filter?: Partial<Task>): Task[];
  
  cancel(taskId: string): boolean;
  
  registerHandler<TPayload, TResult>(
    type: string,
    handler: TaskHandler<TPayload, TResult>
  ): void;
  
  start(): void;
  
  stop(): Promise<void>;
  
  getMetrics(): QueueMetrics;
}

export interface EnqueueOptions {
  dependencies?: string[];
  priority?: number;
  maxRetries?: number;
}

export interface QueueMetrics {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  totalProcessed: number;
  averageProcessingTimeMs: number;
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

export class LocalTaskQueue extends EventEmitter implements TaskQueue {
  private tasks: Map<string, Task> = new Map();
  private handlers: Map<string, TaskHandler> = new Map();
  private completionPromises: Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }> = new Map();
  
  private running: Set<string> = new Set();
  private isRunning: boolean = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  
  private options: Required<QueueOptions>;
  private metrics: {
    completed: number;
    failed: number;
    totalProcessingTimeMs: number;
  } = { completed: 0, failed: 0, totalProcessingTimeMs: 0 };

  constructor(options: QueueOptions = {}) {
    super();
    this.options = {
      maxConcurrent: options.maxConcurrent ?? 5,
      defaultMaxRetries: options.defaultMaxRetries ?? 3,
      pollIntervalMs: options.pollIntervalMs ?? 100,
    };
  }

  /**
   * Add a task to the queue.
   */
  async enqueue<TPayload, TResult>(
    type: string,
    payload: TPayload,
    options: EnqueueOptions = {}
  ): Promise<string> {
    const id = this.generateId();
    
    const task: Task<TPayload, TResult> = {
      id,
      type,
      payload,
      dependencies: options.dependencies ?? [],
      status: options.dependencies?.length ? 'blocked' : 'pending',
      priority: options.priority ?? 0,
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: options.maxRetries ?? this.options.defaultMaxRetries,
    };
    
    this.tasks.set(id, task as Task);
    this.emit('task:enqueued', { taskId: id, type });
    
    // Immediately process if running
    if (this.isRunning) {
      this.processNext();
    }
    
    return id;
  }

  /**
   * Wait for a task to complete.
   */
  onComplete<TResult>(taskId: string): Promise<TResult> {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      return Promise.reject(new Error(`Task not found: ${taskId}`));
    }
    
    if (task.status === 'complete') {
      return Promise.resolve(task.result as TResult);
    }
    
    if (task.status === 'failed') {
      return Promise.reject(new Error(task.error ?? 'Task failed'));
    }
    
    return new Promise((resolve, reject) => {
      this.completionPromises.set(taskId, { 
        resolve: resolve as (value: unknown) => void, 
        reject 
      });
    });
  }

  /**
   * Get a task by ID.
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get tasks matching a filter.
   */
  getTasks(filter?: Partial<Task>): Task[] {
    const tasks = Array.from(this.tasks.values());
    
    if (!filter) return tasks;
    
    return tasks.filter(task => {
      for (const [key, value] of Object.entries(filter)) {
        if (task[key as keyof Task] !== value) return false;
      }
      return true;
    });
  }

  /**
   * Cancel a pending task.
   */
  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    
    if (!task || task.status === 'running' || task.status === 'complete') {
      return false;
    }
    
    task.status = 'failed';
    task.error = 'Cancelled';
    
    const promise = this.completionPromises.get(taskId);
    if (promise) {
      promise.reject(new Error('Task cancelled'));
      this.completionPromises.delete(taskId);
    }
    
    return true;
  }

  /**
   * Register a handler for a task type.
   */
  registerHandler<TPayload, TResult>(
    type: string,
    handler: TaskHandler<TPayload, TResult>
  ): void {
    this.handlers.set(type, handler as TaskHandler);
  }

  /**
   * Start processing tasks.
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.pollInterval = setInterval(() => this.processNext(), this.options.pollIntervalMs);
    this.emit('queue:started');
    
    // Process immediately
    this.processNext();
  }

  /**
   * Stop processing and wait for running tasks to complete.
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    
    // Wait for running tasks
    while (this.running.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.emit('queue:stopped');
  }

  /**
   * Get queue metrics.
   */
  getMetrics(): QueueMetrics {
    const tasks = Array.from(this.tasks.values());
    
    return {
      pending: tasks.filter(t => t.status === 'pending' || t.status === 'blocked').length,
      running: this.running.size,
      completed: this.metrics.completed,
      failed: this.metrics.failed,
      totalProcessed: this.metrics.completed + this.metrics.failed,
      averageProcessingTimeMs: this.metrics.completed > 0
        ? this.metrics.totalProcessingTimeMs / this.metrics.completed
        : 0,
    };
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private async processNext(): Promise<void> {
    if (!this.isRunning) return;
    if (this.running.size >= this.options.maxConcurrent) return;
    
    // Update blocked tasks
    this.updateBlockedTasks();
    
    // Find next task to process
    const task = this.findNextTask();
    if (!task) return;
    
    // Mark as running
    task.status = 'running';
    task.startedAt = new Date();
    this.running.add(task.id);
    
    this.emit('task:started', { taskId: task.id, type: task.type });
    
    // Execute
    try {
      const handler = this.handlers.get(task.type);
      if (!handler) {
        throw new Error(`No handler registered for task type: ${task.type}`);
      }
      
      const context: TaskContext = {
        taskId: task.id,
        taskType: task.type,
        attempt: task.retryCount + 1,
        emit: (event, data) => this.emit(event, { taskId: task.id, ...data as object }),
      };
      
      const result = await handler(task.payload, context);
      
      this.completeTask(task, result);
    } catch (error) {
      this.failTask(task, error as Error);
    }
    
    // Try to process more
    this.processNext();
  }

  private updateBlockedTasks(): void {
    for (const task of this.tasks.values()) {
      if (task.status !== 'blocked') continue;
      
      const allDepsComplete = task.dependencies.every(depId => {
        const dep = this.tasks.get(depId);
        return dep?.status === 'complete';
      });
      
      const anyDepFailed = task.dependencies.some(depId => {
        const dep = this.tasks.get(depId);
        return dep?.status === 'failed';
      });
      
      if (anyDepFailed) {
        task.status = 'failed';
        task.error = 'Dependency failed';
        this.resolveCompletion(task.id, false, undefined, task.error);
      } else if (allDepsComplete) {
        task.status = 'pending';
      }
    }
  }

  private findNextTask(): Task | undefined {
    const pending = Array.from(this.tasks.values())
      .filter(t => t.status === 'pending')
      .sort((a, b) => b.priority - a.priority); // Higher priority first
    
    return pending[0];
  }

  private completeTask(task: Task, result: unknown): void {
    const processingTime = Date.now() - (task.startedAt?.getTime() ?? Date.now());
    
    task.status = 'complete';
    task.completedAt = new Date();
    task.result = result;
    
    this.running.delete(task.id);
    this.metrics.completed++;
    this.metrics.totalProcessingTimeMs += processingTime;
    
    this.emit('task:completed', { 
      taskId: task.id, 
      type: task.type, 
      processingTimeMs: processingTime 
    });
    
    this.resolveCompletion(task.id, true, result);
  }

  private failTask(task: Task, error: Error): void {
    task.retryCount++;
    
    if (task.retryCount < task.maxRetries) {
      // Retry
      task.status = 'pending';
      this.running.delete(task.id);
      this.emit('task:retry', { 
        taskId: task.id, 
        type: task.type, 
        attempt: task.retryCount,
        error: error.message 
      });
    } else {
      // Final failure
      task.status = 'failed';
      task.completedAt = new Date();
      task.error = error.message;
      
      this.running.delete(task.id);
      this.metrics.failed++;
      
      this.emit('task:failed', { 
        taskId: task.id, 
        type: task.type, 
        error: error.message 
      });
      
      this.resolveCompletion(task.id, false, undefined, error.message);
    }
  }

  private resolveCompletion(
    taskId: string, 
    success: boolean, 
    result?: unknown, 
    error?: string
  ): void {
    const promise = this.completionPromises.get(taskId);
    if (promise) {
      if (success) {
        promise.resolve(result);
      } else {
        promise.reject(new Error(error ?? 'Task failed'));
      }
      this.completionPromises.delete(taskId);
    }
  }

  private generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createLocalTaskQueue(options?: QueueOptions): TaskQueue {
  return new LocalTaskQueue(options);
}

// =============================================================================
// COMMON TASK TYPES (for reference)
// =============================================================================

export const TASK_TYPES = {
  // Document processing
  CHUNK_DOCUMENT: 'chunk_document',
  EXTRACT_ENTITIES: 'extract_entities',
  MERGE_EXTRACTIONS: 'merge_extractions',
  INFER_RELATIONSHIPS: 'infer_relationships',
  IDENTIFY_THEMES: 'identify_themes',
  
  // Character creation
  GENERATE_CHARACTER: 'generate_character',
  GENERATE_VOICE_SAMPLES: 'generate_voice_samples',
  BIND_CHARACTER_MODEL: 'bind_character_model',
  
  // Simulation
  PLAN_TICK_EVENTS: 'plan_tick_events',
  EXECUTE_EVENT: 'execute_event',
  UPDATE_WORLD_STATE: 'update_world_state',
  
  // Email generation
  PLAN_EMAIL: 'plan_email',
  GENERATE_EMAIL: 'generate_email',
  REVIEW_EMAIL: 'review_email',
  ASSEMBLE_THREAD: 'assemble_thread',
  
  // Quality
  COHERENCE_CHECK: 'coherence_check',
  VOICE_CONSISTENCY_CHECK: 'voice_consistency_check',
} as const;
