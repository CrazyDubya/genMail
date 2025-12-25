# UI Component Architecture

## Philosophy

EmailVerse uses **vanilla Web Components** with Shadow DOM. No React, Vue, or build-time frameworks. This provides:

1. **No build step**: Components work directly in browser
2. **Encapsulation**: Shadow DOM prevents style leakage
3. **Portability**: Works in Workers, CDN, anywhere
4. **Standards-based**: Future-proof, no framework churn
5. **Progressive enhancement**: Server renders HTML, components hydrate

---

## Component Naming Convention

All components use the `ev-` prefix (EmailVerse):

```
ev-{category}-{name}

Categories:
- (none)  : Shared atomic components
- archive : Archive View specific
- research: Research View specific
- live    : Live View specific
- audio   : Audio View specific
```

Examples:
- `<ev-character-avatar>` - Shared
- `<ev-archive-sidebar>` - Archive View only
- `<ev-live-channel>` - Live View only

---

## Component Hierarchy

```
<ev-viewport-shell>                    # Root container, handles routing
├── <ev-viewport-nav>                  # Tab navigation between views
├── <ev-archive-view>                  # Archive viewport
│   ├── <ev-archive-sidebar>
│   │   ├── <ev-folder-list>
│   │   ├── <ev-character-list>
│   │   │   └── <ev-character-avatar>*
│   │   └── <ev-tension-summary>
│   │       └── <ev-tension-indicator>*
│   ├── <ev-archive-list>
│   │   └── <ev-thread-preview>*
│   │       ├── <ev-character-avatar>
│   │       └── <ev-timestamp>
│   └── <ev-archive-detail>
│       └── <ev-message-bubble>*
│           ├── <ev-character-avatar>
│           ├── <ev-timestamp>
│           └── <ev-document-reference>*
├── <ev-research-view>                 # Research viewport
│   ├── <ev-research-document>
│   │   └── <ev-research-annotation>*
│   └── <ev-research-panel>
│       ├── <ev-character-avatar>*
│       └── <ev-research-chat>
│           └── <ev-message-bubble>*
├── <ev-live-view>                     # Live viewport
│   ├── <ev-live-sidebar>
│   │   ├── <ev-live-channel-list>
│   │   └── <ev-live-dm-list>
│   ├── <ev-live-channel>
│   │   ├── <ev-live-message>*
│   │   │   ├── <ev-character-avatar>
│   │   │   └── <ev-timestamp>
│   │   └── <ev-live-typing>
│   └── <ev-live-input>
└── <ev-audio-view>                    # Audio viewport
    ├── <ev-audio-player>
    ├── <ev-audio-episode-list>
    └── <ev-audio-transcript>
        └── <ev-message-bubble>*
```

---

## Base Component Pattern

All components extend a base class:

```typescript
// src/ui/base-component.ts

export abstract class EVComponent extends HTMLElement {
  protected shadow: ShadowRoot;
  protected state: Record<string, unknown> = {};

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  // Lifecycle
  connectedCallback(): void {
    this.render();
    this.setupEventListeners();
  }

  disconnectedCallback(): void {
    this.cleanup();
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string): void {
    if (oldValue !== newValue) {
      this.onAttributeChange(name, oldValue, newValue);
      this.render();
    }
  }

  // To be implemented by subclasses
  protected abstract render(): void;
  protected setupEventListeners(): void {}
  protected cleanup(): void {}
  protected onAttributeChange(name: string, oldValue: string, newValue: string): void {}

  // Utility: Update state and re-render
  protected setState(updates: Partial<typeof this.state>): void {
    this.state = { ...this.state, ...updates };
    this.render();
  }

  // Utility: Emit custom event
  protected emit<T>(eventName: string, detail: T): void {
    this.dispatchEvent(new CustomEvent(eventName, {
      bubbles: true,
      composed: true, // Crosses shadow DOM boundary
      detail,
    }));
  }

  // Utility: Query within shadow DOM
  protected $(selector: string): Element | null {
    return this.shadow.querySelector(selector);
  }

  protected $$(selector: string): Element[] {
    return Array.from(this.shadow.querySelectorAll(selector));
  }
}
```

---

## Shared Components

### ev-character-avatar

Displays a character's avatar with optional status indicator.

```typescript
// src/ui/components/ev-character-avatar.ts

import { EVComponent } from '../base-component.js';

export class EVCharacterAvatar extends EVComponent {
  static observedAttributes = ['character-id', 'size', 'show-status', 'status'];

  static get styles(): string {
    return `
      :host {
        display: inline-block;
      }
      .avatar {
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        text-transform: uppercase;
        position: relative;
      }
      .avatar.small { width: 24px; height: 24px; font-size: 10px; }
      .avatar.medium { width: 36px; height: 36px; font-size: 14px; }
      .avatar.large { width: 48px; height: 48px; font-size: 18px; }

      .status {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        border: 2px solid var(--bg-color, #000);
      }
      .status.online { background: var(--status-online, #3ba55c); }
      .status.away { background: var(--status-away, #faa61a); }
      .status.offline { background: var(--status-offline, #747f8d); }
    `;
  }

  protected render(): void {
    const characterId = this.getAttribute('character-id') || '';
    const size = this.getAttribute('size') || 'medium';
    const showStatus = this.hasAttribute('show-status');
    const status = this.getAttribute('status') || 'offline';

    // Generate color from character ID
    const color = this.generateColor(characterId);
    const initials = this.getInitials(characterId);

    this.shadow.innerHTML = `
      <style>${EVCharacterAvatar.styles}</style>
      <div class="avatar ${size}" style="background: ${color}">
        ${initials}
        ${showStatus ? `<div class="status ${status}"></div>` : ''}
      </div>
    `;
  }

  private generateColor(id: string): string {
    // Deterministic color from ID
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 60%, 40%)`;
  }

  private getInitials(id: string): string {
    // Would fetch from character data in real implementation
    return id.slice(0, 2).toUpperCase();
  }
}

customElements.define('ev-character-avatar', EVCharacterAvatar);
```

### ev-message-bubble

Displays a message with sender attribution.

```typescript
// src/ui/components/ev-message-bubble.ts

import { EVComponent } from '../base-component.js';

export class EVMessageBubble extends EVComponent {
  static observedAttributes = ['sender-id', 'sender-name', 'timestamp', 'type'];

  static get styles(): string {
    return `
      :host {
        display: block;
        margin: 8px 0;
      }
      .bubble {
        display: flex;
        gap: 12px;
      }
      .content {
        flex: 1;
      }
      .header {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin-bottom: 4px;
      }
      .sender {
        font-weight: 600;
        color: var(--text-primary);
      }
      .body {
        color: var(--text-secondary);
        line-height: 1.5;
      }
      .body ::slotted(p) {
        margin: 0 0 8px 0;
      }

      /* Type variations */
      :host([type="email"]) .bubble {
        padding: 16px;
        background: var(--bubble-bg, rgba(255,255,255,0.05));
        border-radius: 8px;
      }
      :host([type="chat"]) .bubble {
        padding: 4px 0;
      }
      :host([type="annotation"]) .bubble {
        padding: 8px;
        background: var(--annotation-bg, rgba(74, 158, 255, 0.1));
        border-left: 3px solid var(--annotation-accent, #4a9eff);
      }
    `;
  }

  protected render(): void {
    const senderId = this.getAttribute('sender-id') || '';
    const senderName = this.getAttribute('sender-name') || senderId;
    const timestamp = this.getAttribute('timestamp') || '';
    const type = this.getAttribute('type') || 'chat';

    this.shadow.innerHTML = `
      <style>${EVMessageBubble.styles}</style>
      <div class="bubble">
        <ev-character-avatar
          character-id="${senderId}"
          size="${type === 'email' ? 'large' : 'medium'}">
        </ev-character-avatar>
        <div class="content">
          <div class="header">
            <span class="sender">${senderName}</span>
            <ev-timestamp value="${timestamp}"></ev-timestamp>
          </div>
          <div class="body">
            <slot></slot>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('ev-message-bubble', EVMessageBubble);
```

### ev-timestamp

Displays relative or absolute time.

```typescript
// src/ui/components/ev-timestamp.ts

import { EVComponent } from '../base-component.js';

export class EVTimestamp extends EVComponent {
  static observedAttributes = ['value', 'format'];

  private updateInterval: number | null = null;

  static get styles(): string {
    return `
      :host {
        color: var(--text-tertiary, #666);
        font-size: 0.85em;
      }
    `;
  }

  protected render(): void {
    const value = this.getAttribute('value') || '';
    const format = this.getAttribute('format') || 'relative';

    const date = new Date(value);
    const display = format === 'relative'
      ? this.getRelativeTime(date)
      : this.getAbsoluteTime(date);

    this.shadow.innerHTML = `
      <style>${EVTimestamp.styles}</style>
      <time datetime="${date.toISOString()}" title="${date.toLocaleString()}">
        ${display}
      </time>
    `;
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Update relative time every minute
    if (this.getAttribute('format') !== 'absolute') {
      this.updateInterval = window.setInterval(() => this.render(), 60000);
    }
  }

  protected cleanup(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }

  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return this.getAbsoluteTime(date);
  }

  private getAbsoluteTime(date: Date): string {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  }
}

customElements.define('ev-timestamp', EVTimestamp);
```

### ev-tension-indicator

Visual indicator for tension level and status.

```typescript
// src/ui/components/ev-tension-indicator.ts

import { EVComponent } from '../base-component.js';

type TensionStatus = 'building' | 'active' | 'climax' | 'resolving' | 'resolved';

export class EVTensionIndicator extends EVComponent {
  static observedAttributes = ['tension-id', 'intensity', 'status', 'label'];

  static get styles(): string {
    return `
      :host {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        transition: all 0.3s ease;
      }
      .indicator.building { background: #ffd700; }
      .indicator.active { background: #ff6b35; animation: pulse 1s infinite; }
      .indicator.climax { background: #ff0000; animation: pulse 0.5s infinite; }
      .indicator.resolving { background: #4a9eff; }
      .indicator.resolved { background: #3ba55c; }

      .bar {
        width: 60px;
        height: 4px;
        background: var(--bar-bg, rgba(255,255,255,0.1));
        border-radius: 2px;
        overflow: hidden;
      }
      .bar-fill {
        height: 100%;
        border-radius: 2px;
        transition: width 0.5s ease;
      }
      .bar-fill.low { background: #3ba55c; }
      .bar-fill.medium { background: #ffd700; }
      .bar-fill.high { background: #ff6b35; }
      .bar-fill.critical { background: #ff0000; }

      .label {
        font-size: 0.85em;
        color: var(--text-secondary);
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.7; transform: scale(1.2); }
      }
    `;
  }

  protected render(): void {
    const intensity = parseFloat(this.getAttribute('intensity') || '0');
    const status = (this.getAttribute('status') || 'building') as TensionStatus;
    const label = this.getAttribute('label');

    const intensityClass = this.getIntensityClass(intensity);
    const widthPercent = Math.min(100, intensity * 100);

    this.shadow.innerHTML = `
      <style>${EVTensionIndicator.styles}</style>
      <div class="indicator ${status}"></div>
      <div class="bar">
        <div class="bar-fill ${intensityClass}" style="width: ${widthPercent}%"></div>
      </div>
      ${label ? `<span class="label">${label}</span>` : ''}
    `;
  }

  private getIntensityClass(intensity: number): string {
    if (intensity < 0.25) return 'low';
    if (intensity < 0.5) return 'medium';
    if (intensity < 0.75) return 'high';
    return 'critical';
  }
}

customElements.define('ev-tension-indicator', EVTensionIndicator);
```

---

## Viewport Shell

The root component that manages viewport switching:

```typescript
// src/ui/viewports/ev-viewport-shell.ts

import { EVComponent } from '../base-component.js';

type ViewportId = 'archive' | 'research' | 'live' | 'audio';

export class EVViewportShell extends EVComponent {
  static observedAttributes = ['universe-id', 'active-viewport'];

  private activeViewport: ViewportId = 'archive';

  static get styles(): string {
    return `
      :host {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background: var(--shell-bg, #0a0a0a);
        color: var(--shell-text, #e0e0e0);
      }

      .nav {
        display: flex;
        gap: 4px;
        padding: 8px 16px;
        background: var(--nav-bg, rgba(255,255,255,0.05));
        border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.1));
      }

      .nav-tab {
        padding: 8px 16px;
        border: none;
        background: transparent;
        color: var(--text-secondary);
        cursor: pointer;
        border-radius: 4px;
        font-family: inherit;
        font-size: 14px;
        transition: all 0.2s;
      }
      .nav-tab:hover {
        background: rgba(255,255,255,0.1);
      }
      .nav-tab.active {
        background: var(--accent-color, #00ff88);
        color: #000;
      }
      .nav-tab.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .viewport-container {
        flex: 1;
        overflow: hidden;
        position: relative;
      }

      .viewport {
        position: absolute;
        inset: 0;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s;
      }
      .viewport.active {
        opacity: 1;
        pointer-events: auto;
      }

      .coming-soon {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--text-tertiary);
      }
      .coming-soon h2 {
        margin: 0 0 8px 0;
      }
    `;
  }

  protected render(): void {
    const universeId = this.getAttribute('universe-id') || '';
    this.activeViewport = (this.getAttribute('active-viewport') || 'archive') as ViewportId;

    this.shadow.innerHTML = `
      <style>${EVViewportShell.styles}</style>

      <nav class="nav">
        <button class="nav-tab ${this.activeViewport === 'archive' ? 'active' : ''}"
                data-viewport="archive">
          📧 Archive
        </button>
        <button class="nav-tab ${this.activeViewport === 'research' ? 'active' : ''}"
                data-viewport="research">
          🔬 Research
        </button>
        <button class="nav-tab ${this.activeViewport === 'live' ? 'active' : ''}"
                data-viewport="live">
          💬 Live
        </button>
        <button class="nav-tab ${this.activeViewport === 'audio' ? 'active' : ''}"
                data-viewport="audio">
          🎧 Audio
        </button>
      </nav>

      <div class="viewport-container">
        <div class="viewport ${this.activeViewport === 'archive' ? 'active' : ''}"
             id="viewport-archive">
          <ev-archive-view universe-id="${universeId}"></ev-archive-view>
        </div>

        <div class="viewport ${this.activeViewport === 'research' ? 'active' : ''}"
             id="viewport-research">
          ${this.renderComingSoon('Research View', 'Document analysis with character perspectives')}
        </div>

        <div class="viewport ${this.activeViewport === 'live' ? 'active' : ''}"
             id="viewport-live">
          ${this.renderComingSoon('Live View', 'Real-time conversation simulation')}
        </div>

        <div class="viewport ${this.activeViewport === 'audio' ? 'active' : ''}"
             id="viewport-audio">
          ${this.renderComingSoon('Audio View', 'Podcast-style character discussions')}
        </div>
      </div>
    `;
  }

  private renderComingSoon(title: string, description: string): string {
    return `
      <div class="coming-soon">
        <h2>${title}</h2>
        <p>${description}</p>
        <p><em>Coming soon...</em></p>
      </div>
    `;
  }

  protected setupEventListeners(): void {
    this.shadow.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const viewport = target.dataset.viewport as ViewportId;
        if (viewport) {
          this.switchViewport(viewport);
        }
      });
    });
  }

  private switchViewport(viewport: ViewportId): void {
    this.setAttribute('active-viewport', viewport);
    this.emit('viewport-change', { viewport });

    // Update URL without reload
    const url = new URL(window.location.href);
    url.searchParams.set('view', viewport);
    window.history.pushState({}, '', url);
  }
}

customElements.define('ev-viewport-shell', EVViewportShell);
```

---

## State Management

Components communicate through:

### 1. Custom Events (Up the tree)

```typescript
// Child emits
this.emit('email-selected', { emailId: '123' });

// Parent listens
this.addEventListener('email-selected', (e: CustomEvent) => {
  this.loadEmail(e.detail.emailId);
});
```

### 2. Attributes (Down the tree)

```typescript
// Parent sets
child.setAttribute('selected-id', '123');

// Child observes
static observedAttributes = ['selected-id'];
attributeChangedCallback(name, oldValue, newValue) {
  if (name === 'selected-id') {
    this.loadSelected(newValue);
  }
}
```

### 3. Shared Store (Cross-tree)

```typescript
// src/ui/store.ts

interface UniverseState {
  universeId: string;
  characters: Map<string, Character>;
  emails: Email[];
  tensions: Tension[];
  selectedEmailId: string | null;
  activeViewport: ViewportId;
}

class UniverseStore {
  private state: UniverseState;
  private listeners: Set<(state: UniverseState) => void> = new Set();

  subscribe(listener: (state: UniverseState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setState(updates: Partial<UniverseState>): void {
    this.state = { ...this.state, ...updates };
    this.listeners.forEach(l => l(this.state));
  }

  getState(): UniverseState {
    return this.state;
  }
}

export const store = new UniverseStore();
```

---

## Styling Strategy

### Design Tokens

```css
/* src/ui/styles/tokens.css */

:root {
  /* Colors - Base */
  --color-black: #000000;
  --color-white: #ffffff;

  /* Colors - Semantic */
  --color-success: #3ba55c;
  --color-warning: #faa61a;
  --color-error: #ed4245;
  --color-info: #4a9eff;

  /* Typography */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* Borders */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.1);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow: 400ms ease;
}
```

### Theme Application

Each viewport imports tokens and applies its theme:

```css
/* src/ui/styles/archive-theme.css */
@import './tokens.css';

:root {
  /* Archive-specific overrides */
  --bg-primary: #0a0a0a;
  --bg-secondary: #111111;
  --text-primary: #00ff88;
  --text-secondary: #007744;
  --accent-color: #00ffcc;
  --font-family: var(--font-mono);
}
```

---

## Performance Considerations

### 1. Virtualization for Long Lists

```typescript
// For email lists with 100+ items
class EVVirtualList extends EVComponent {
  private visibleItems: number = 20;
  private itemHeight: number = 60;
  private scrollTop: number = 0;

  protected render(): void {
    const start = Math.floor(this.scrollTop / this.itemHeight);
    const end = start + this.visibleItems;
    const visibleData = this.data.slice(start, end);

    // Only render visible items
    // Use translateY for positioning
  }
}
```

### 2. Lazy Loading Viewports

```typescript
// Don't load viewport components until activated
private loadViewport(id: ViewportId): void {
  if (!customElements.get(`ev-${id}-view`)) {
    import(`./ev-${id}-view.js`);
  }
}
```

### 3. Event Debouncing

```typescript
// Debounce rapid state updates
private debouncedRender = debounce(() => this.render(), 16);

protected setState(updates: Partial<typeof this.state>): void {
  this.state = { ...this.state, ...updates };
  this.debouncedRender();
}
```

---

## Accessibility

All components follow WCAG 2.1 guidelines:

```typescript
// Keyboard navigation
protected setupEventListeners(): void {
  this.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown': this.focusNext(); break;
      case 'ArrowUp': this.focusPrevious(); break;
      case 'Enter': this.selectFocused(); break;
      case 'Escape': this.clearSelection(); break;
    }
  });
}

// ARIA attributes
protected render(): void {
  this.shadow.innerHTML = `
    <ul role="listbox" aria-label="Email threads">
      ${this.threads.map(t => `
        <li role="option"
            aria-selected="${t.id === this.selectedId}"
            tabindex="${t.id === this.selectedId ? 0 : -1}">
          ...
        </li>
      `).join('')}
    </ul>
  `;
}

// Screen reader announcements
private announce(message: string): void {
  const announcer = document.getElementById('sr-announcer');
  if (announcer) {
    announcer.textContent = message;
  }
}
```

---

## Testing Strategy

### Unit Tests (Component Logic)

```typescript
// tests/components/ev-timestamp.test.ts
import { EVTimestamp } from '../../src/ui/components/ev-timestamp.js';

describe('EVTimestamp', () => {
  let element: EVTimestamp;

  beforeEach(() => {
    element = document.createElement('ev-timestamp') as EVTimestamp;
    document.body.appendChild(element);
  });

  afterEach(() => {
    element.remove();
  });

  it('renders relative time for recent dates', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    element.setAttribute('value', fiveMinutesAgo);

    const time = element.shadowRoot?.querySelector('time');
    expect(time?.textContent).toBe('5m ago');
  });
});
```

### Integration Tests (Component Interactions)

```typescript
// tests/integration/viewport-shell.test.ts
describe('Viewport Shell', () => {
  it('switches viewports on tab click', async () => {
    const shell = document.createElement('ev-viewport-shell');
    document.body.appendChild(shell);

    const researchTab = shell.shadowRoot?.querySelector('[data-viewport="research"]');
    researchTab?.click();

    await new Promise(r => setTimeout(r, 0)); // Wait for render

    expect(shell.getAttribute('active-viewport')).toBe('research');
  });
});
```

---

## Build & Bundle

While components work without bundling, for production:

```typescript
// build.ts
import { build } from 'esbuild';

await build({
  entryPoints: ['src/ui/index.ts'],
  bundle: true,
  minify: true,
  format: 'esm',
  outfile: 'dist/emailverse-ui.js',
  target: ['es2020'],
});
```

This creates a single file that can be loaded:

```html
<script type="module" src="/dist/emailverse-ui.js"></script>
<ev-viewport-shell universe-id="abc123"></ev-viewport-shell>
```
