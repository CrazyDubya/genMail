emailverse/
├── packages/
│   ├── core/                      # Shared types, utilities
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── world.ts       # WorldState, Character, Tension
│   │   │   │   ├── email.ts       # Email, Thread, Folder
│   │   │   │   ├── task.ts        # Task, TaskQueue interfaces
│   │   │   │   └── agent.ts       # AgentConfig, TeamConfig
│   │   │   ├── utils/
│   │   │   │   ├── chunker.ts     # Document chunking
│   │   │   │   └── merge.ts       # Entity merging logic
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── agents/                    # Agent implementations
│   │   ├── src/
│   │   │   ├── director.ts        # Main orchestrator (Claude)
│   │   │   ├── research/
│   │   │   │   ├── lead.ts        # Research team lead (Gemini)
│   │   │   │   └── workers.ts     # Extraction workers
│   │   │   ├── character/
│   │   │   │   ├── lead.ts        # Character team lead (Claude)
│   │   │   │   ├── profiler.ts    # Character generation
│   │   │   │   └── voice-binder.ts
│   │   │   ├── content/
│   │   │   │   ├── lead.ts        # Content team lead
│   │   │   │   ├── email-gen.ts   # Email generation
│   │   │   │   └── threading.ts   # Thread assembly
│   │   │   └── models/
│   │   │       ├── router.ts      # Model routing logic
│   │   │       ├── claude.ts      # Claude SDK wrapper
│   │   │       ├── openai.ts      # OpenAI wrapper
│   │   │       ├── gemini.ts      # Gemini wrapper
│   │   │       ├── grok.ts        # Grok wrapper
│   │   │       └── openrouter.ts  # OpenRouter wrapper
│   │   └── package.json
│   │
│   ├── simulation/                # World simulation
│   │   ├── src/
│   │   │   ├── world-state.ts     # WorldState management
│   │   │   ├── tick.ts            # Simulation tick logic
│   │   │   ├── events.ts          # Event generation
│   │   │   └── artifacts.ts       # Email artifact creation
│   │   └── package.json
│   │
│   ├── queue/                     # Task queue abstraction
│   │   ├── src/
│   │   │   ├── interface.ts       # Queue interface
│   │   │   ├── local.ts           # In-memory implementation
│   │   │   └── cloudflare.ts      # CF Queues implementation
│   │   └── package.json
│   │
│   ├── storage/                   # Storage abstraction
│   │   ├── src/
│   │   │   ├── interface.ts       # Storage interface
│   │   │   ├── local.ts           # SQLite + filesystem
│   │   │   └── cloudflare.ts      # D1 + R2 + KV
│   │   └── package.json
│   │
│   └── ui/                        # Web Components UI
│       ├── src/
│       │   ├── components/
│       │   │   ├── email-app.ts
│       │   │   ├── folder-list.ts
│       │   │   ├── email-list.ts
│       │   │   ├── email-view.ts
│       │   │   ├── email-thread.ts
│       │   │   ├── email-message.ts
│       │   │   ├── compose-modal.ts  # Phase 2+
│       │   │   └── generation-status.ts
│       │   ├── styles/
│       │   │   ├── base.css
│       │   │   ├── theme-recovered.css
│       │   │   └── glitch-effects.css
│       │   └── index.ts
│       └── package.json
│
├── apps/
│   ├── local/                     # Local development server
│   │   ├── src/
│   │   │   ├── server.ts          # Hono server
│   │   │   ├── routes/
│   │   │   │   ├── universe.ts
│   │   │   │   └── emails.ts
│   │   │   └── index.ts
│   │   ├── public/                # Static assets
│   │   └── package.json
│   │
│   └── cloudflare/                # Cloudflare Workers
│       ├── src/
│       │   ├── worker.ts          # Main worker
│       │   └── queue-consumer.ts  # Task processor
│       ├── wrangler.toml
│       └── package.json
│
├── package.json                   # Workspace root
├── pnpm-workspace.yaml
└── README.md
