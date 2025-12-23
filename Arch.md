┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    EMAILVERSE                                            │
│                     Agentic Email Universe Generator                                     │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              PRESENTATION LAYER                                  │   │
│  │                                                                                  │   │
│  │   Web Components + Progressive Enhancement                                       │   │
│  │   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │   │
│  │   │ <email-app>  │ │<folder-list> │ │<email-list>  │ │<email-view>  │          │   │
│  │   └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘          │   │
│  │                                                                                  │   │
│  │   Theme: "Recovered Archive" - Authentic client + cyberpunk aesthetic           │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                               │
│                                         ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              API LAYER                                           │   │
│  │                                                                                  │   │
│  │   Local: Express/Hono server          Cloudflare: Workers                        │   │
│  │                                                                                  │   │
│  │   POST /universe/create    - Start generation from documents                     │   │
│  │   GET  /universe/:id       - Get generation status                               │   │
│  │   GET  /universe/:id/emails - Get generated emails                               │   │
│  │   POST /universe/:id/reply  - User reply (Phase 2+)                              │   │
│  │   POST /universe/:id/generate-more - Extend thread (Phase 3)                     │   │
│  │   POST /universe/:id/documents - Add documents (Phase 4)                         │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                               │
│                                         ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                           ORCHESTRATION LAYER                                    │   │
│  │                                                                                  │   │
│  │   ┌─────────────────────────────────────────────────────────────────────────┐   │   │
│  │   │                    DIRECTOR AGENT (Claude Sonnet)                       │   │   │
│  │   │                                                                         │   │   │
│  │   │  Responsibilities:                                                      │   │   │
│  │   │  - Decompose documents into processing tasks                            │   │   │
│  │   │  - Spawn and coordinate agent teams                                     │   │   │
│  │   │  - Make strategic decisions (which tensions to develop)                 │   │   │
│  │   │  - Final coherence review                                               │   │   │
│  │   │  - Handle Phase 2-4 user interactions                                   │   │   │
│  │   └─────────────────────────────────────────────────────────────────────────┘   │   │
│  │                                    │                                             │   │
│  │         ┌──────────────────────────┼──────────────────────────┐                 │   │
│  │         ▼                          ▼                          ▼                 │   │
│  │   ┌───────────────┐        ┌───────────────┐        ┌───────────────┐          │   │
│  │   │   RESEARCH    │        │   CHARACTER   │        │   CONTENT     │          │   │
│  │   │     TEAM      │        │     TEAM      │        │     TEAM      │          │   │
│  │   │               │        │               │        │               │          │   │
│  │   │ Lead: Gemini  │        │ Lead: Claude  │        │ Lead: varies  │          │   │
│  │   │ Workers: cheap│        │ Workers: all  │        │ Workers: bound│          │   │
│  │   │               │        │               │        │ to characters │          │   │
│  │   │ Tasks:        │        │ Tasks:        │        │               │          │   │
│  │   │ - Chunk docs  │        │ - Profile gen │        │ Tasks:        │          │   │
│  │   │ - Extract     │        │ - Voice bind  │        │ - Email gen   │          │   │
│  │   │ - Merge       │        │ - Relationship│        │ - Threading   │          │   │
│  │   │ - Verify      │        │ - Goals/secrets│       │ - Formatting  │          │   │
│  │   └───────────────┘        └───────────────┘        └───────────────┘          │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                               │
│                                         ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                           SIMULATION LAYER                                       │   │
│  │                                                                                  │   │
│  │   WorldState + Time Simulation Engine                                            │   │
│  │                                                                                  │   │
│  │   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                       │   │
│  │   │   World     │────▶│  Simulator  │────▶│  Artifacts  │                       │   │
│  │   │   State     │     │  (ticks)    │     │  (emails)   │                       │   │
│  │   │             │◀────│             │     │             │                       │   │
│  │   │ - Characters│     │ - Events    │     │ - Threads   │                       │   │
│  │   │ - Relations │     │ - Reactions │     │ - Singles   │                       │   │
│  │   │ - Tensions  │     │ - Updates   │     │ - Spam      │                       │   │
│  │   │ - Knowledge │     │             │     │ - News      │                       │   │
│  │   └─────────────┘     └─────────────┘     └─────────────┘                       │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                               │
│                                         ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              TASK LAYER                                          │   │
│  │                                                                                  │   │
│  │   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐           │   │
│  │   │   Task Queue    │────▶│   Dispatcher    │────▶│   Model Router  │           │   │
│  │   │                 │     │                 │     │                 │           │   │
│  │   │ Local: In-mem   │     │ Assigns tasks   │     │ Routes to:      │           │   │
│  │   │ CF: Queues      │     │ to agents       │     │ - Claude SDK    │           │   │
│  │   │                 │     │ Handles deps    │     │ - OpenAI        │           │   │
│  │   │                 │     │ Retries         │     │ - Gemini        │           │   │
│  │   │                 │     │                 │     │ - Grok          │           │   │
│  │   │                 │     │                 │     │ - OpenRouter    │           │   │
│  │   └─────────────────┘     └─────────────────┘     └─────────────────┘           │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                               │
│                                         ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              STORAGE LAYER                                       │   │
│  │                                                                                  │   │
│  │   Local: SQLite + File System          Cloudflare: D1 + R2 + KV                  │   │
│  │                                                                                  │   │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │   │
│  │   │  Documents   │  │    World     │  │   Emails     │  │    Assets    │        │   │
│  │   │  (raw +      │  │    State     │  │  (generated) │  │  (avatars,   │        │   │
│  │   │   chunks)    │  │  (characters │  │              │  │   etc.)      │        │   │
│  │   │              │  │   tensions)  │  │              │  │              │        │   │
│  │   └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘        │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
