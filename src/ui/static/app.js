/**
 * EmailVerse - Web Components Email Client
 * With session management, mailbox switching, and improved mobile UI
 */

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

class SessionManager {
  constructor() {
    this.token = localStorage.getItem('emailverse_session_token');
    this.sessionId = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { 'X-Session-Token': this.token } : {}),
        },
      });

      const data = await response.json();

      if (data.token) {
        this.token = data.token;
        this.sessionId = data.sessionId;
        localStorage.setItem('emailverse_session_token', data.token);
        this.initialized = true;
        return data;
      }
    } catch (error) {
      console.error('Failed to initialize session:', error);
    }

    return null;
  }

  getHeaders() {
    return this.token ? { 'X-Session-Token': this.token } : {};
  }

  clearSession() {
    this.token = null;
    this.sessionId = null;
    this.initialized = false;
    localStorage.removeItem('emailverse_session_token');
    localStorage.removeItem('emailverse_universe_id');
  }
}

const session = new SessionManager();

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
    this.mailboxes = [];
    this.showMailboxDrawer = false;
    this.listeners = new Set();
    // Mobile navigation state: 'folders' | 'emails' | 'view'
    this.mobileView = 'emails';
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

  setMailboxes(mailboxes) {
    this.mailboxes = mailboxes;
    this.notify();
  }

  toggleMailboxDrawer() {
    this.showMailboxDrawer = !this.showMailboxDrawer;
    this.notify();
  }

  setUniverse(universeId, data) {
    this.universeId = universeId;
    this.emails = data.emails || [];
    this.threads = data.threads || [];
    this.characters = data.characters || [];
    this.folders = data.folders || [];

    // Auto-select folder with emails if current folder is empty
    this.autoSelectFolder();

    this.notify();
  }

  autoSelectFolder() {
    const currentFolderEmails = this.getEmailsForFolder();
    if (currentFolderEmails.length === 0 && this.emails.length > 0) {
      // Find a folder that has emails
      const folderWithEmails = this.folders.find(f => f.count > 0);
      if (folderWithEmails) {
        this.selectedFolder = folderWithEmails.type;
      } else {
        // Fallback: check actual email folders
        const actualFolders = [...new Set(this.emails.map(e => e.folder))];
        if (actualFolders.length > 0) {
          this.selectedFolder = actualFolders[0];
        }
      }
    }
  }

  selectFolder(folder) {
    this.selectedFolder = folder;
    this.selectedEmail = null;
    this.notify();
  }

  selectEmail(email) {
    this.selectedEmail = email;
    // Auto-switch to view on mobile when email is selected
    if (email && this.isMobile()) {
      this.mobileView = 'view';
    }
    this.notify();
  }

  setMobileView(view) {
    this.mobileView = view;
    this.notify();
  }

  isMobile() {
    return window.innerWidth <= 768;
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

  clear() {
    this.universeId = null;
    this.emails = [];
    this.threads = [];
    this.characters = [];
    this.folders = [];
    this.selectedFolder = 'inbox';
    this.selectedEmail = null;
    this.status = null;
    this.notify();
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
      headers: {
        'Content-Type': 'application/json',
        ...session.getHeaders(),
      },
      body: JSON.stringify({ documents, config }),
    });
    return response.json();
  },

  async getStatus(universeId) {
    const response = await fetch(`/api/universe/${universeId}/status`, {
      headers: session.getHeaders(),
    });
    return response.json();
  },

  async getEmails(universeId, folder) {
    const url = folder
      ? `/api/universe/${universeId}/emails?folder=${folder}`
      : `/api/universe/${universeId}/emails`;
    const response = await fetch(url, {
      headers: session.getHeaders(),
    });
    return response.json();
  },

  async markRead(universeId, emailId) {
    await fetch(`/api/universe/${universeId}/emails/${emailId}/read`, {
      method: 'PATCH',
      headers: session.getHeaders(),
    });
  },

  async toggleStar(universeId, emailId) {
    const response = await fetch(`/api/universe/${universeId}/emails/${emailId}/star`, {
      method: 'PATCH',
      headers: session.getHeaders(),
    });
    return response.json();
  },

  async getMailboxes() {
    const response = await fetch('/api/mailboxes', {
      headers: session.getHeaders(),
    });
    return response.json();
  },

  async activateMailbox(universeId) {
    const response = await fetch(`/api/mailboxes/${universeId}/activate`, {
      method: 'POST',
      headers: session.getHeaders(),
    });
    return response.json();
  },

  async renameMailbox(universeId, name) {
    const response = await fetch(`/api/mailboxes/${universeId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...session.getHeaders(),
      },
      body: JSON.stringify({ name }),
    });
    return response.json();
  },

  async deleteMailbox(universeId) {
    const response = await fetch(`/api/mailboxes/${universeId}`, {
      method: 'DELETE',
      headers: session.getHeaders(),
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

function formatMailboxDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
    this.initializeApp();
  }

  disconnectedCallback() {
    if (this.unsubscribe) this.unsubscribe();
  }

  async initializeApp() {
    state.setLoading(true);

    // Initialize session
    const sessionData = await session.initialize();

    if (sessionData && sessionData.mailboxes && sessionData.mailboxes.length > 0) {
      state.setMailboxes(sessionData.mailboxes);

      // Find active mailbox
      const activeMailbox = sessionData.mailboxes.find(m => m.isActive);
      if (activeMailbox) {
        await this.loadMailbox(activeMailbox.universeId);
      }
    }

    // Also check localStorage for backward compatibility
    const savedId = localStorage.getItem('emailverse_universe_id');
    if (savedId && !state.universeId) {
      await this.checkForExistingUniverse(savedId);
    }

    state.setLoading(false);
  }

  async loadMailbox(universeId) {
    try {
      state.setLoading(true);
      const status = await api.getStatus(universeId);

      if (status.status === 'complete') {
        const data = await api.getEmails(universeId);
        state.setUniverse(universeId, data);
        localStorage.setItem('emailverse_universe_id', universeId);
      } else if (status.status === 'processing') {
        state.setStatus(status);
        this.pollStatus(universeId);
      } else if (status.status === 'failed') {
        state.setStatus(status);
      }
    } catch (e) {
      console.error('Failed to load mailbox:', e);
    } finally {
      state.setLoading(false);
    }
  }

  async checkForExistingUniverse(savedId) {
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
    } catch (_e) {
      localStorage.removeItem('emailverse_universe_id');
    } finally {
      state.setLoading(false);
    }
  }

  async pollStatus(universeId) {
    let consecutiveErrors = 0;
    const maxErrors = 5;

    const poll = async () => {
      try {
        const status = await api.getStatus(universeId);
        state.setStatus(status);
        consecutiveErrors = 0;

        if (status.status === 'complete') {
          const data = await api.getEmails(universeId);
          state.setUniverse(universeId, data);
          // Refresh mailboxes list
          const mailboxesData = await api.getMailboxes();
          state.setMailboxes(mailboxesData.mailboxes || []);
        } else if (status.status === 'failed') {
          console.error('Generation failed:', status.error);
        } else if (status.status === 'processing') {
          setTimeout(poll, 1500);
        }
      } catch (e) {
        console.error('Poll failed:', e);
        consecutiveErrors++;
        if (consecutiveErrors < maxErrors) {
          setTimeout(poll, 2000 * consecutiveErrors);
        } else {
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

  async switchMailbox(universeId) {
    await api.activateMailbox(universeId);
    state.clear();
    state.showMailboxDrawer = false;
    await this.loadMailbox(universeId);
  }

  render() {
    if (state.loading) {
      this.innerHTML = `
        <div class="loading">
          <div class="loading-spinner"></div>
          <div class="loading-text">Loading...</div>
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
          <div class="error-icon">!</div>
          <div class="error-title">Generation Failed</div>
          <div class="error-message">${escapeHtml(state.status.error || 'Unknown error')}</div>
          ${cost && cost.callCount > 0 ? `
            <div class="error-cost">
              Cost incurred: $${cost.totalCost.toFixed(4)} (${cost.callCount} API calls)
            </div>
          ` : ''}
          <button class="btn btn-primary" onclick="localStorage.removeItem('emailverse_universe_id'); location.reload();">
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
            <button class="mailbox-toggle" onclick="state.toggleMailboxDrawer()">
              <span class="hamburger"></span>
            </button>
            <h1>EmailVerse</h1>
          </div>
          ${state.mailboxes.length > 0 ? `
            <div class="header-status">
              <span>${state.mailboxes.length} mailbox${state.mailboxes.length !== 1 ? 'es' : ''}</span>
            </div>
          ` : ''}
        </header>
        ${state.showMailboxDrawer ? `<mailbox-drawer></mailbox-drawer>` : ''}
        <upload-form></upload-form>
      `;
      return;
    }

    const isMobile = state.isMobile();
    const mobileView = state.mobileView;

    this.innerHTML = `
      <header class="header">
        <div class="header-logo">
          <button class="mailbox-toggle" onclick="state.toggleMailboxDrawer()">
            <span class="hamburger"></span>
          </button>
          <h1>EmailVerse</h1>
        </div>
        <div class="header-status">
          <span class="status-indicator"></span>
          <span>${state.emails.length} messages</span>
        </div>
      </header>
      ${state.showMailboxDrawer ? `<mailbox-drawer></mailbox-drawer>` : ''}
      <nav class="mobile-nav">
        <button class="mobile-nav-btn ${mobileView === 'folders' ? 'active' : ''}" data-view="folders">
          <span class="nav-icon">F</span>
          <span>Folders</span>
        </button>
        <button class="mobile-nav-btn ${mobileView === 'emails' ? 'active' : ''}" data-view="emails">
          <span class="nav-icon">E</span>
          <span>Emails</span>
        </button>
        <button class="mobile-nav-btn ${mobileView === 'view' ? 'active' : ''}" data-view="view" ${!state.selectedEmail ? 'disabled' : ''}>
          <span class="nav-icon">V</span>
          <span>View</span>
        </button>
      </nav>
      <div class="main-content">
        <folder-list class="${isMobile && mobileView === 'folders' ? 'active' : ''}"></folder-list>
        <email-list class="${isMobile && mobileView !== 'emails' ? 'hidden-mobile' : ''}"></email-list>
        <email-view class="${isMobile && mobileView === 'view' ? 'active' : ''}"></email-view>
      </div>
    `;

    // Attach mobile nav event listeners
    this.querySelectorAll('.mobile-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view === 'view' && !state.selectedEmail) return;
        state.setMobileView(view);
      });
    });
  }
}

// =============================================================================
// MAILBOX DRAWER COMPONENT
// =============================================================================

class MailboxDrawer extends HTMLElement {
  constructor() {
    super();
    this.unsubscribe = null;
  }

  connectedCallback() {
    this.unsubscribe = state.subscribe(() => this.render());
    this.render();
    this.loadMailboxes();
  }

  disconnectedCallback() {
    if (this.unsubscribe) this.unsubscribe();
  }

  async loadMailboxes() {
    try {
      const data = await api.getMailboxes();
      state.setMailboxes(data.mailboxes || []);
    } catch (e) {
      console.error('Failed to load mailboxes:', e);
    }
  }

  render() {
    const mailboxes = state.mailboxes;

    this.innerHTML = `
      <div class="drawer-overlay" onclick="state.toggleMailboxDrawer()"></div>
      <div class="drawer">
        <div class="drawer-header">
          <h2>Your Mailboxes</h2>
          <button class="drawer-close" onclick="state.toggleMailboxDrawer()">×</button>
        </div>
        <div class="drawer-content">
          ${mailboxes.length === 0 ? `
            <div class="drawer-empty">
              <p>No mailboxes yet</p>
              <p class="text-muted">Upload documents to create your first mailbox</p>
            </div>
          ` : `
            <div class="mailbox-list">
              ${mailboxes.map(mb => `
                <div class="mailbox-item ${mb.isActive ? 'active' : ''}" data-id="${mb.universeId}">
                  <div class="mailbox-info">
                    <div class="mailbox-name">${escapeHtml(mb.name || 'Unnamed Mailbox')}</div>
                    <div class="mailbox-meta">
                      ${mb.emailCount} emails • ${formatMailboxDate(mb.createdAt)}
                      ${mb.status === 'processing' ? '<span class="badge">Generating...</span>' : ''}
                    </div>
                  </div>
                  <div class="mailbox-actions">
                    <button class="btn-icon" onclick="event.stopPropagation(); this.closest('mailbox-drawer').renameMailbox('${mb.universeId}')" title="Rename">
                      ✎
                    </button>
                    <button class="btn-icon btn-danger" onclick="event.stopPropagation(); this.closest('mailbox-drawer').deleteMailbox('${mb.universeId}')" title="Delete">
                      ×
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
        <div class="drawer-footer">
          <button class="btn btn-primary btn-block" onclick="state.toggleMailboxDrawer(); state.clear();">
            + New Mailbox
          </button>
        </div>
      </div>
    `;

    // Attach click handlers for mailbox selection
    this.querySelectorAll('.mailbox-item').forEach(item => {
      item.addEventListener('click', async () => {
        const universeId = item.dataset.id;
        const app = document.querySelector('email-app');
        await app.switchMailbox(universeId);
      });
    });
  }

  async renameMailbox(universeId) {
    const mb = state.mailboxes.find(m => m.universeId === universeId);
    const newName = prompt('Enter new name:', mb?.name || '');
    if (newName && newName.trim()) {
      await api.renameMailbox(universeId, newName.trim());
      await this.loadMailboxes();
    }
  }

  async deleteMailbox(universeId) {
    if (confirm('Are you sure you want to delete this mailbox? This cannot be undone.')) {
      await api.deleteMailbox(universeId);
      await this.loadMailboxes();
      if (state.universeId === universeId) {
        state.clear();
        localStorage.removeItem('emailverse_universe_id');
      }
    }
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
        <div class="upload-hero">
          <h2>Create Your Email Universe</h2>
          <p>Upload documents to generate a network of fictional emails</p>
        </div>
        <div class="upload-area" id="dropzone">
          <div class="upload-icon">+</div>
          <p>Drop files here or tap to select</p>
          <p class="text-muted">PDF, TXT, MD files supported</p>
          <input type="file" id="file-input" multiple accept=".pdf,.txt,.md" style="display: none;">
        </div>
        <div id="file-list" class="file-list"></div>
        <button class="btn btn-primary btn-lg" id="generate-btn" disabled>Generate Emails</button>
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

    const removeFile = (index) => {
      files.splice(index, 1);
      updateFileList();
    };

    const updateFileList = () => {
      fileList.innerHTML = files.map((f, i) => `
        <div class="file-item">
          <span class="file-name">${escapeHtml(f.name)}</span>
          <span class="file-size">${(f.size / 1024).toFixed(1)} KB</span>
          <button class="btn-icon btn-danger" data-index="${i}">×</button>
        </div>
      `).join('');

      // Add remove handlers
      fileList.querySelectorAll('.btn-icon').forEach(btn => {
        btn.addEventListener('click', () => {
          removeFile(parseInt(btn.dataset.index));
        });
      });

      generateBtn.disabled = files.length === 0;
    };

    generateBtn.addEventListener('click', async () => {
      if (files.length === 0) return;

      generateBtn.disabled = true;
      generateBtn.textContent = 'Processing...';

      try {
        const documents = await Promise.all(files.map(async (file) => {
          const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

          let content;
          if (isPdf) {
            // For PDFs, use base64 encoding to preserve binary data
            const arrayBuffer = await file.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            content = btoa(binary); // Base64 encode
          } else {
            // Text files can use text() directly
            content = await file.text();
          }

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
        generateBtn.textContent = 'Generate Emails';
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
      inbox: 'IN',
      sent: 'SE',
      newsletters: 'NL',
      spam: 'SP',
      flagged: '★',
      trash: 'TR',
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
            <span class="folder-icon">${folderIcons[folder.type] || 'F'}</span>
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
        // On mobile, switch to emails view after selecting folder
        if (state.isMobile()) {
          state.setMobileView('emails');
        }
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
          <div class="empty-icon">📭</div>
          <p>No messages in this folder</p>
        </div>
      ` : `
        <div class="email-items">
          ${emails.map(email => `
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
        </div>
      `}
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
    // Add active class on mobile if in view mode
    if (state.isMobile() && state.mobileView === 'view') {
      this.classList.add('active');
    }

    if (!state.selectedEmail) {
      this.innerHTML = `
        <div class="email-view-empty">
          <div class="empty-icon">📧</div>
          <p>Select an email to view</p>
        </div>
      `;
      return;
    }

    const email = state.selectedEmail;
    const thread = state.getThread(email.threadId);
    const isThread = thread.length > 1;

    const backButton = `
      <button class="mobile-back-btn" onclick="state.setMobileView('emails')">
        ← Back
      </button>
    `;

    if (isThread) {
      this.innerHTML = `
        ${backButton}
        <div class="email-view-header">
          <div class="email-view-subject">${escapeHtml(email.subject)}</div>
          <div class="thread-count">${thread.length} messages in thread</div>
        </div>
        <div class="thread-container">
          ${thread.map(msg => `
            <div class="thread-message">
              <div class="thread-message-header">
                <div>
                  <span class="thread-message-from">${escapeHtml(msg.from.displayName)}</span>
                  <span class="thread-message-to">
                    → ${msg.to.map(t => escapeHtml(t.displayName)).join(', ')}
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
        ${backButton}
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
customElements.define('mailbox-drawer', MailboxDrawer);
customElements.define('upload-form', UploadForm);
customElements.define('folder-list', FolderList);
customElements.define('email-list', EmailList);
customElements.define('email-view', EmailView);
