/**
 * Tests for UI state management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock AppState class (mirroring app.js implementation)
class AppState {
  universeId: string | null = null;
  emails: any[] = [];
  threads: any[] = [];
  characters: any[] = [];
  folders: any[] = [];
  selectedFolder = 'inbox';
  selectedEmail: any = null;
  loading = false;
  status: any = null;
  listeners = new Set<(state: AppState) => void>();
  mobileView: 'folders' | 'emails' | 'view' = 'emails';

  subscribe(listener: (state: AppState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this);
    }
  }

  setLoading(loading: boolean) {
    this.loading = loading;
    this.notify();
  }

  setStatus(status: any) {
    this.status = status;
    this.notify();
  }

  setUniverse(universeId: string, data: any) {
    this.universeId = universeId;
    this.emails = data.emails || [];
    this.threads = data.threads || [];
    this.characters = data.characters || [];
    this.folders = data.folders || [];
    this.notify();
  }

  selectFolder(folder: string) {
    this.selectedFolder = folder;
    this.selectedEmail = null;
    this.notify();
  }

  selectEmail(email: any) {
    this.selectedEmail = email;
    if (email && this.isMobile()) {
      this.mobileView = 'view';
    }
    this.notify();
  }

  setMobileView(view: 'folders' | 'emails' | 'view') {
    this.mobileView = view;
    this.notify();
  }

  isMobile() {
    return typeof window !== 'undefined' && window.innerWidth <= 768;
  }

  getEmailsForFolder() {
    if (this.selectedFolder === 'flagged') {
      return this.emails.filter((e) => e.isStarred);
    }
    return this.emails.filter((e) => e.folder === this.selectedFolder);
  }

  getThread(threadId: string) {
    return this.emails
      .filter((e) => e.threadId === threadId)
      .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
  }

  getCharacter(characterId: string) {
    return this.characters.find((c) => c.id === characterId);
  }
}

describe('AppState', () => {
  let state: AppState;

  beforeEach(() => {
    state = new AppState();
  });

  describe('initialization', () => {
    it('should have correct default values', () => {
      expect(state.universeId).toBeNull();
      expect(state.emails).toEqual([]);
      expect(state.selectedFolder).toBe('inbox');
      expect(state.selectedEmail).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.mobileView).toBe('emails');
    });
  });

  describe('subscription', () => {
    it('should notify listeners on state change', () => {
      const listener = vi.fn();
      state.subscribe(listener);

      state.setLoading(true);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(state);
    });

    it('should allow unsubscription', () => {
      const listener = vi.fn();
      const unsubscribe = state.subscribe(listener);

      unsubscribe();
      state.setLoading(true);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should support multiple listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      state.subscribe(listener1);
      state.subscribe(listener2);
      state.setLoading(true);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });

  describe('setUniverse', () => {
    it('should set universe data correctly', () => {
      const mockData = {
        emails: [{ id: 'e1', folder: 'inbox' }],
        threads: [{ id: 't1' }],
        characters: [{ id: 'c1', name: 'Test' }],
        folders: [{ type: 'inbox', count: 1 }],
      };

      state.setUniverse('universe-123', mockData);

      expect(state.universeId).toBe('universe-123');
      expect(state.emails).toEqual(mockData.emails);
      expect(state.threads).toEqual(mockData.threads);
      expect(state.characters).toEqual(mockData.characters);
      expect(state.folders).toEqual(mockData.folders);
    });

    it('should handle empty data gracefully', () => {
      state.setUniverse('universe-123', {});

      expect(state.universeId).toBe('universe-123');
      expect(state.emails).toEqual([]);
      expect(state.folders).toEqual([]);
    });
  });

  describe('folder selection', () => {
    it('should change selected folder', () => {
      state.selectFolder('sent');
      expect(state.selectedFolder).toBe('sent');
    });

    it('should clear selected email when folder changes', () => {
      state.selectedEmail = { id: 'e1' };
      state.selectFolder('spam');
      expect(state.selectedEmail).toBeNull();
    });
  });

  describe('getEmailsForFolder', () => {
    beforeEach(() => {
      state.emails = [
        { id: 'e1', folder: 'inbox', isStarred: false },
        { id: 'e2', folder: 'inbox', isStarred: true },
        { id: 'e3', folder: 'sent', isStarred: false },
        { id: 'e4', folder: 'spam', isStarred: true },
      ];
    });

    it('should filter emails by folder', () => {
      state.selectedFolder = 'inbox';
      const emails = state.getEmailsForFolder();

      expect(emails).toHaveLength(2);
      expect(emails.every((e) => e.folder === 'inbox')).toBe(true);
    });

    it('should return starred emails for flagged folder', () => {
      state.selectedFolder = 'flagged';
      const emails = state.getEmailsForFolder();

      expect(emails).toHaveLength(2);
      expect(emails.every((e) => e.isStarred)).toBe(true);
    });

    it('should return empty array for empty folder', () => {
      state.selectedFolder = 'trash';
      const emails = state.getEmailsForFolder();

      expect(emails).toEqual([]);
    });
  });

  describe('getThread', () => {
    beforeEach(() => {
      state.emails = [
        { id: 'e1', threadId: 't1', sentAt: '2024-01-01T10:00:00Z' },
        { id: 'e2', threadId: 't1', sentAt: '2024-01-01T12:00:00Z' },
        { id: 'e3', threadId: 't1', sentAt: '2024-01-01T11:00:00Z' },
        { id: 'e4', threadId: 't2', sentAt: '2024-01-02T10:00:00Z' },
      ];
    });

    it('should return emails in thread sorted by date', () => {
      const thread = state.getThread('t1');

      expect(thread).toHaveLength(3);
      expect(thread[0].id).toBe('e1');
      expect(thread[1].id).toBe('e3');
      expect(thread[2].id).toBe('e2');
    });

    it('should return empty array for non-existent thread', () => {
      const thread = state.getThread('non-existent');
      expect(thread).toEqual([]);
    });
  });

  describe('mobile view management', () => {
    it('should change mobile view', () => {
      state.setMobileView('folders');
      expect(state.mobileView).toBe('folders');

      state.setMobileView('view');
      expect(state.mobileView).toBe('view');
    });
  });
});
