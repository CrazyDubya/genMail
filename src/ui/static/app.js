/**
 * EmailVerse - Web Components Email Client
 */

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

class AppState {
  constructor() {
    this.universeId = null;
    this.emails = [];
    this.threads = [];
    this.characters = [];
    this.folders = [];
    this.selectedFolder = 'inbox';
    this.selectedEmail = null;
    this.loading = false;
    this.status = null;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this);
    }
  }

  setLoading(loading) {
    this.loading = loading;
    this.notify();
  }

  setStatus(status) {
    this.status = status;
    this.notify();
  }

  setUniverse(universeId, data) {
    this.universeId = universeId;
    this.emails = data.emails || [];
    this.threads = data.threads || [];
    this.characters = data.characters || [];
    this.folders = data.folders || [];
    this.notify();
  }

  selectFolder(folder) {
    this.selectedFolder = folder;
    this.selectedEmail = null;
    this.notify();
  }

  selectEmail(email) {
    this.selectedEmail = email;
    this.notify();
  }

  getEmailsForFolder() {
    if (this.selectedFolder === 'flagged') {
      return this.emails.filter(e => e.isStarred);
    }
    return this.emails.filter(e => e.folder === this.selectedFolder);
  }

  getThread(threadId) {
    return this.emails
      .filter(e => e.threadId === threadId)
      .sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));
  }

  getCharacter(characterId) {
    return this.characters.find(c => c.id === characterId);
  }
}

const state = new AppState();

// =============================================================================
// API CLIENT
// =============================================================================

const api = {
  async createUniverse(documents, config = {}) {
    const response = await fetch('/api/universe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents, config }),
    });
    return response.json();
  },

  async getStatus(universeId) {
    const response = await fetch(`/api/universe/${universeId}/status`);
    return response.json();
  },

  async getEmails(universeId, folder) {
    const url = folder
      ? `/api/universe/${universeId}/emails?folder=${folder}`
      : `/api/universe/${universeId}/emails`;
    const response = await fetch(url);
    return response.json();
  },

  async markRead(universeId, emailId) {
    await fetch(`/api/universe/${universeId}/emails/${emailId}/read`, {
      method: 'PATCH',
    });
  },

  async toggleStar(universeId, emailId) {
    const response = await fetch(`/api/universe/${universeId}/emails/${emailId}/star`, {
      method: 'PATCH',
    });
    return response.json();
  },
};

// =============================================================================
// UTILITIES
// =============================================================================

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return date.toLocaleDateString('en-US', { weekday: 'short' });

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// =============================================================================
// EMAIL APP COMPONENT
// =============================================================================

class EmailApp extends HTMLElement {
  constructor() {
    super();
    this.unsubscribe = null;
  }

  connectedCallback() {
    this.unsubscribe = state.subscribe(() => this.render());
    this.render();
    this.checkForExistingUniverse();
  }

  disconnectedCallback() {
    if (this.unsubscribe) this.unsubscribe();
  }

  async checkForExistingUniverse() {
    // Check localStorage for existing universe
    const savedId = localStorage.getItem('emailverse_universe_id');
    if (savedId) {
      try {
        state.setLoading(true);
        const status = await api.getStatus(savedId);
        if (status.status === 'complete') {
          const data = await api.getEmails(savedId);
          state.setUniverse(savedId, data);
        } else if (status.status === 'processing') {
          state.setStatus(status);
          this.pollStatus(savedId);
        }
      } catch (e) {
        localStorage.removeItem('emailverse_universe_id');
      } finally {
        state.setLoading(false);
      }
    }
  }

  async pollStatus(universeId) {
    let consecutiveErrors = 0;
    const maxErrors = 5;

    const poll = async () => {
      try {
        const status = await api.getStatus(universeId);
        state.setStatus(status);
        consecutiveErrors = 0; // Reset on success

        if (status.status === 'complete') {
          const data = await api.getEmails(universeId);
          state.setUniverse(universeId, data);
        } else if (status.status === 'failed') {
          // Stop polling on failure - the UI will show the error
          console.error('Generation failed:', status.error);
        } else if (status.status === 'processing') {
          setTimeout(poll, 1500); // Poll slightly faster for better feedback
        }
      } catch (e) {
        console.error('Poll failed:', e);
        consecutiveErrors++;
        if (consecutiveErrors < maxErrors) {
          // Retry with backoff
          setTimeout(poll, 2000 * consecutiveErrors);
        } else {
          // Show network error after too many failures
          state.setStatus({
            status: 'failed',
            error: 'Lost connection to server. Please refresh the page.',
            progress: { phase: 'documents', percentComplete: 0 },
          });
        }
      }
    };
    poll();
  }

  render() {
    if (state.loading) {
      this.innerHTML = `
        <div class="loading">
          <div class="loading-spinner"></div>
          <div class="loading-text">Loading archive...</div>
        </div>
      `;
      return;
    }

    if (state.status && state.status.status === 'processing') {
      const progress = state.status.progress;
      const cost = state.status.cost;
      const elapsed = progress.elapsedSeconds || 0;
      const elapsedStr = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;

      this.innerHTML = `
        <div class="loading">
          <div class="loading-spinner"></div>
          <div class="loading-text">${progress.currentTask || 'Processing...'}</div>
          ${progress.subTask ? `<div class="loading-subtext">${progress.subTask}</div>` : ''}
          <div class="progress-bar">
            <div class="progress-bar-fill" style="width: ${progress.percentComplete}%"></div>
          </div>
          <div class="loading-text">${progress.percentComplete}% complete</div>
          ${progress.itemsProcessed !== undefined && progress.itemsTotal ? `
            <div class="loading-items">${progress.itemsProcessed} / ${progress.itemsTotal} items</div>
          ` : ''}
          <div class="loading-stats">
            <span>Elapsed: ${elapsedStr}</span>
            ${cost && cost.callCount > 0 ? `
              <span>API Calls: ${cost.callCount}</span>
              <span>Cost: $${cost.totalCost.toFixed(4)}</span>
            ` : ''}
          </div>
        </div>
      `;
      return;
    }

    if (state.status && state.status.status === 'failed') {
      const cost = state.status.cost;
      this.innerHTML = `
        <div class="error-container">
          <div class="error-icon">⚠️</div>
          <div class="error-title">Generation Failed</div>
          <div class="error-message">${escapeHtml(state.status.error || 'Unknown error')}</div>
          ${cost && cost.callCount > 0 ? `
            <div class="error-cost">
              Cost incurred: $${cost.totalCost.toFixed(4)} (${cost.callCount} API calls)
            </div>
          ` : ''}
          <button class="retry-button" onclick="localStorage.removeItem('emailverse_universe_id'); location.reload();">
            Try Again
          </button>
        </div>
      `;
      return;
    }

    if (!state.universeId) {
      this.innerHTML = `
        <header class="header">
          <div class="header-logo">
            <h1>[RECOVERED ARCHIVE]</h1>
          </div>
        </header>
        <upload-form></upload-form>
      `;
      return;
    }

    this.innerHTML = `
      <header class="header">
        <div class="header-logo">
          <h1>[RECOVERED ARCHIVE]</h1>
        </div>
        <div class="header-status">
          <span class="status-indicator"></span>
          <span>${state.emails.length} messages recovered</span>
        </div>
      </header>
      <div class="main-content">
        <folder-list></folder-list>
        <email-list></email-list>
        <email-view></email-view>
      </div>
    `;
  }
}

// =============================================================================
// UPLOAD FORM COMPONENT
// =============================================================================

class UploadForm extends HTMLElement {
  connectedCallback() {
    this.render();
    this.attachEventListeners();
  }

  render() {
    this.innerHTML = `
      <div class="upload-form">
        <h2>Upload documents to generate your email universe</h2>
        <div class="upload-area" id="dropzone">
          <p>Drop files here or click to select</p>
          <p style="color: var(--text-muted); font-size: 0.9em;">PDF, TXT, MD files supported</p>
          <input type="file" id="file-input" multiple accept=".pdf,.txt,.md" style="display: none;">
        </div>
        <div id="file-list"></div>
        <button class="upload-button" id="generate-btn" disabled>Generate Universe</button>
      </div>
    `;
  }

  attachEventListeners() {
    const dropzone = this.querySelector('#dropzone');
    const fileInput = this.querySelector('#file-input');
    const generateBtn = this.querySelector('#generate-btn');
    const fileList = this.querySelector('#file-list');

    let files = [];

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files);
    });

    const handleFiles = (newFiles) => {
      files = [...files, ...Array.from(newFiles)];
      updateFileList();
    };

    const updateFileList = () => {
      fileList.innerHTML = files.map((f, i) => `
        <div style="display: flex; gap: 8px; align-items: center; margin: 8px 0;">
          <span>${f.name}</span>
          <span style="color: var(--text-muted);">(${(f.size / 1024).toFixed(1)} KB)</span>
          <button onclick="this.parentElement.remove()" style="background: none; border: none; color: var(--error); cursor: pointer;">×</button>
        </div>
      `).join('');

      generateBtn.disabled = files.length === 0;
    };

    generateBtn.addEventListener('click', async () => {
      if (files.length === 0) return;

      generateBtn.disabled = true;
      generateBtn.textContent = 'Processing...';

      try {
        const documents = await Promise.all(files.map(async (file) => {
          const content = await file.text();
          return {
            filename: file.name,
            mimeType: file.type || 'text/plain',
            content,
          };
        }));

        const result = await api.createUniverse(documents);
        localStorage.setItem('emailverse_universe_id', result.universeId);

        state.setStatus({
          status: 'processing',
          progress: { phase: 'documents', percentComplete: 0, currentTask: 'Starting...' },
        });

        // Start polling
        const app = document.querySelector('email-app');
        app.pollStatus(result.universeId);
      } catch (error) {
        console.error('Failed to create universe:', error);
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate Universe';
      }
    });
  }
}

// =============================================================================
// FOLDER LIST COMPONENT
// =============================================================================

class FolderList extends HTMLElement {
  constructor() {
    super();
    this.unsubscribe = null;
  }

  connectedCallback() {
    this.unsubscribe = state.subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback() {
    if (this.unsubscribe) this.unsubscribe();
  }

  render() {
    const folderIcons = {
      inbox: '📥',
      sent: '📤',
      newsletters: '📰',
      spam: '🚫',
      flagged: '⭐',
      trash: '🗑️',
    };

    const folderNames = {
      inbox: 'Inbox',
      sent: 'Sent',
      newsletters: 'Newsletters',
      spam: 'Spam',
      flagged: 'Starred',
      trash: 'Trash',
    };

    this.className = 'folder-list';
    this.innerHTML = `
      <h2>Folders</h2>
      ${state.folders.map(folder => `
        <div class="folder-item ${state.selectedFolder === folder.type ? 'active' : ''}"
             data-folder="${folder.type}">
          <span class="folder-name">
            <span>${folderIcons[folder.type] || '📁'}</span>
            <span>${folderNames[folder.type] || folder.type}</span>
          </span>
          <span class="folder-count ${folder.unreadCount > 0 ? 'unread' : ''}">
            ${folder.unreadCount > 0 ? folder.unreadCount : folder.count}
          </span>
        </div>
      `).join('')}
    `;

    this.querySelectorAll('.folder-item').forEach(item => {
      item.addEventListener('click', () => {
        state.selectFolder(item.dataset.folder);
      });
    });
  }
}

// =============================================================================
// EMAIL LIST COMPONENT
// =============================================================================

class EmailList extends HTMLElement {
  constructor() {
    super();
    this.unsubscribe = null;
  }

  connectedCallback() {
    this.unsubscribe = state.subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback() {
    if (this.unsubscribe) this.unsubscribe();
  }

  render() {
    const emails = state.getEmailsForFolder();
    const folderNames = {
      inbox: 'Inbox',
      sent: 'Sent',
      newsletters: 'Newsletters',
      spam: 'Spam',
      flagged: 'Starred',
      trash: 'Trash',
    };

    this.className = 'email-list';
    this.innerHTML = `
      <div class="email-list-header">
        <h2>${folderNames[state.selectedFolder] || state.selectedFolder}</h2>
        <span class="email-list-count">${emails.length} messages</span>
      </div>
      ${emails.length === 0 ? `
        <div class="empty-state">
          <p>No messages in this folder</p>
        </div>
      ` : emails.map(email => `
        <div class="email-item ${!email.isRead ? 'unread' : ''} ${state.selectedEmail?.id === email.id ? 'selected' : ''}"
             data-id="${email.id}">
          <div class="email-from">${escapeHtml(email.from.displayName)}</div>
          <div class="email-subject">${escapeHtml(email.subject)}</div>
          <div class="email-preview">${escapeHtml(email.body.slice(0, 80))}...</div>
          <div class="email-meta">
            <span>${formatDate(email.sentAt)}</span>
            <span class="email-star ${email.isStarred ? 'starred' : ''}" data-star="${email.id}">
              ${email.isStarred ? '★' : '☆'}
            </span>
          </div>
        </div>
      `).join('')}
    `;

    // Email click handlers
    this.querySelectorAll('.email-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        if (e.target.classList.contains('email-star')) return;

        const email = emails.find(em => em.id === item.dataset.id);
        if (email) {
          state.selectEmail(email);
          if (!email.isRead && state.universeId) {
            await api.markRead(state.universeId, email.id);
            email.isRead = true;
          }
        }
      });
    });

    // Star click handlers
    this.querySelectorAll('.email-star').forEach(star => {
      star.addEventListener('click', async (e) => {
        e.stopPropagation();
        const email = emails.find(em => em.id === star.dataset.star);
        if (email && state.universeId) {
          const result = await api.toggleStar(state.universeId, email.id);
          email.isStarred = result.isStarred;
          state.notify();
        }
      });
    });
  }
}

// =============================================================================
// EMAIL VIEW COMPONENT
// =============================================================================

class EmailView extends HTMLElement {
  constructor() {
    super();
    this.unsubscribe = null;
  }

  connectedCallback() {
    this.unsubscribe = state.subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback() {
    if (this.unsubscribe) this.unsubscribe();
  }

  render() {
    this.className = 'email-view';

    if (!state.selectedEmail) {
      this.innerHTML = `
        <div class="email-view-empty">
          Select an email to view
        </div>
      `;
      return;
    }

    const email = state.selectedEmail;
    const thread = state.getThread(email.threadId);
    const isThread = thread.length > 1;

    if (isThread) {
      this.innerHTML = `
        <div class="email-view-header">
          <div class="email-view-subject">${escapeHtml(email.subject)}</div>
          <div style="color: var(--text-muted); font-size: 0.9em;">
            ${thread.length} messages in thread
          </div>
        </div>
        <div class="thread-container">
          ${thread.map(msg => `
            <div class="thread-message">
              <div class="thread-message-header">
                <div>
                  <span class="thread-message-from">${escapeHtml(msg.from.displayName)}</span>
                  <span style="color: var(--text-muted);">
                    to ${msg.to.map(t => escapeHtml(t.displayName)).join(', ')}
                  </span>
                </div>
                <span class="thread-message-date">${formatDate(msg.sentAt)}</span>
              </div>
              <div class="thread-message-body">${escapeHtml(msg.body)}</div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      this.innerHTML = `
        <div class="email-view-header">
          <div class="email-view-subject">${escapeHtml(email.subject)}</div>
          <div class="email-view-meta">
            <span class="email-view-from">From: ${escapeHtml(email.from.displayName)}</span>
            <span class="email-view-to">To: ${email.to.map(t => escapeHtml(t.displayName)).join(', ')}</span>
            <span class="email-view-date">${formatDate(email.sentAt)}</span>
          </div>
        </div>
        <div class="email-view-body">${escapeHtml(email.body)}</div>
      `;
    }
  }
}

// =============================================================================
// REGISTER COMPONENTS
// =============================================================================

customElements.define('email-app', EmailApp);
customElements.define('upload-form', UploadForm);
customElements.define('folder-list', FolderList);
customElements.define('email-list', EmailList);
customElements.define('email-view', EmailView);
