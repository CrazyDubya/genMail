/**
 * Tests for mobile responsiveness
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock AppState class for mobile testing
class AppState {
  universeId: string | null = null;
  emails: any[] = [];
  selectedFolder = 'inbox';
  selectedEmail: any = null;
  listeners = new Set<(state: AppState) => void>();
  mobileView: 'folders' | 'emails' | 'view' = 'emails';
  folders: any[] = [];

  private _windowWidth = 1024;

  // Test helper to simulate window width
  setWindowWidth(width: number) {
    this._windowWidth = width;
  }

  subscribe(listener: (state: AppState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this);
    }
  }

  selectFolder(folder: string) {
    this.selectedFolder = folder;
    this.selectedEmail = null;
    // On mobile, switch to emails view after selecting folder
    if (this.isMobile()) {
      this.mobileView = 'emails';
    }
    this.notify();
  }

  selectEmail(email: any) {
    this.selectedEmail = email;
    // Auto-switch to view on mobile when email is selected
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
    return this._windowWidth <= 768;
  }

  getEmailsForFolder() {
    if (this.selectedFolder === 'flagged') {
      return this.emails.filter((e) => e.isStarred);
    }
    return this.emails.filter((e) => e.folder === this.selectedFolder);
  }
}

describe('Mobile Responsiveness', () => {
  let state: AppState;

  beforeEach(() => {
    state = new AppState();
    state.emails = [
      { id: 'e1', folder: 'inbox', isStarred: false },
      { id: 'e2', folder: 'inbox', isStarred: true },
      { id: 'e3', folder: 'sent', isStarred: false },
    ];
    state.folders = [
      { type: 'inbox', count: 2 },
      { type: 'sent', count: 1 },
    ];
  });

  describe('isMobile detection', () => {
    it('should return true for width <= 768', () => {
      state.setWindowWidth(768);
      expect(state.isMobile()).toBe(true);

      state.setWindowWidth(320);
      expect(state.isMobile()).toBe(true);

      state.setWindowWidth(767);
      expect(state.isMobile()).toBe(true);
    });

    it('should return false for width > 768', () => {
      state.setWindowWidth(769);
      expect(state.isMobile()).toBe(false);

      state.setWindowWidth(1024);
      expect(state.isMobile()).toBe(false);

      state.setWindowWidth(1920);
      expect(state.isMobile()).toBe(false);
    });
  });

  describe('mobile view state', () => {
    it('should default to emails view', () => {
      expect(state.mobileView).toBe('emails');
    });

    it('should allow setting mobile view', () => {
      state.setMobileView('folders');
      expect(state.mobileView).toBe('folders');

      state.setMobileView('view');
      expect(state.mobileView).toBe('view');
    });

    it('should notify listeners when mobile view changes', () => {
      const listener = vi.fn();
      state.subscribe(listener);

      state.setMobileView('folders');

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('mobile navigation behavior', () => {
    beforeEach(() => {
      state.setWindowWidth(375); // Mobile width
    });

    it('should switch to emails view when folder is selected on mobile', () => {
      state.mobileView = 'folders';

      state.selectFolder('sent');

      expect(state.selectedFolder).toBe('sent');
      expect(state.mobileView).toBe('emails');
    });

    it('should switch to view when email is selected on mobile', () => {
      const email = { id: 'e1', folder: 'inbox' };

      state.selectEmail(email);

      expect(state.selectedEmail).toBe(email);
      expect(state.mobileView).toBe('view');
    });

    it('should not change view when selecting null email', () => {
      state.mobileView = 'emails';

      state.selectEmail(null);

      expect(state.mobileView).toBe('emails');
    });
  });

  describe('desktop behavior', () => {
    beforeEach(() => {
      state.setWindowWidth(1024); // Desktop width
    });

    it('should NOT switch view when folder is selected on desktop', () => {
      state.mobileView = 'folders';

      state.selectFolder('sent');

      expect(state.selectedFolder).toBe('sent');
      expect(state.mobileView).toBe('folders'); // Should not change
    });

    it('should NOT switch view when email is selected on desktop', () => {
      const email = { id: 'e1', folder: 'inbox' };
      state.mobileView = 'emails';

      state.selectEmail(email);

      expect(state.selectedEmail).toBe(email);
      expect(state.mobileView).toBe('emails'); // Should not change
    });
  });

  describe('email filtering', () => {
    it('should return filtered emails for selected folder', () => {
      state.selectedFolder = 'inbox';
      const emails = state.getEmailsForFolder();

      expect(emails).toHaveLength(2);
      expect(emails.every((e) => e.folder === 'inbox')).toBe(true);
    });

    it('should work correctly on mobile', () => {
      state.setWindowWidth(375);
      state.selectedFolder = 'inbox';

      const emails = state.getEmailsForFolder();

      expect(emails).toHaveLength(2);
    });

    it('should return starred emails for flagged folder', () => {
      state.selectedFolder = 'flagged';
      const emails = state.getEmailsForFolder();

      expect(emails).toHaveLength(1);
      expect(emails[0].id).toBe('e2');
    });
  });
});

describe('CSS Class Generation', () => {
  // Helper to simulate the class generation logic from app.js
  function getComponentClasses(
    isMobile: boolean,
    mobileView: 'folders' | 'emails' | 'view'
  ): { folderList: string; emailList: string; emailView: string } {
    return {
      folderList: isMobile && mobileView === 'folders' ? 'active' : '',
      emailList: isMobile && mobileView !== 'emails' ? 'hidden-mobile' : '',
      emailView: isMobile && mobileView === 'view' ? 'active' : '',
    };
  }

  describe('desktop classes', () => {
    it('should have no special classes on desktop', () => {
      const classes = getComponentClasses(false, 'emails');

      expect(classes.folderList).toBe('');
      expect(classes.emailList).toBe('');
      expect(classes.emailView).toBe('');
    });
  });

  describe('mobile classes', () => {
    it('should show folder list when in folders view', () => {
      const classes = getComponentClasses(true, 'folders');

      expect(classes.folderList).toBe('active');
      expect(classes.emailList).toBe('hidden-mobile');
      expect(classes.emailView).toBe('');
    });

    it('should show email list when in emails view', () => {
      const classes = getComponentClasses(true, 'emails');

      expect(classes.folderList).toBe('');
      expect(classes.emailList).toBe('');
      expect(classes.emailView).toBe('');
    });

    it('should show email view when in view mode', () => {
      const classes = getComponentClasses(true, 'view');

      expect(classes.folderList).toBe('');
      expect(classes.emailList).toBe('hidden-mobile');
      expect(classes.emailView).toBe('active');
    });
  });
});
