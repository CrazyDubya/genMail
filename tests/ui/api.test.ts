/**
 * Tests for API client
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock API client (mirroring app.js implementation)
const createApi = (fetchMock: typeof fetch) => ({
  async createUniverse(documents: any[], config = {}) {
    const response = await fetchMock('/api/universe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents, config }),
    });
    return response.json();
  },

  async getStatus(universeId: string) {
    const response = await fetchMock(`/api/universe/${universeId}/status`);
    return response.json();
  },

  async getEmails(universeId: string, folder?: string) {
    const url = folder
      ? `/api/universe/${universeId}/emails?folder=${folder}`
      : `/api/universe/${universeId}/emails`;
    const response = await fetchMock(url);
    return response.json();
  },

  async markRead(universeId: string, emailId: string) {
    await fetchMock(`/api/universe/${universeId}/emails/${emailId}/read`, {
      method: 'PATCH',
    });
  },

  async toggleStar(universeId: string, emailId: string) {
    const response = await fetchMock(`/api/universe/${universeId}/emails/${emailId}/star`, {
      method: 'PATCH',
    });
    return response.json();
  },
});

describe('API Client', () => {
  let api: ReturnType<typeof createApi>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    api = createApi(fetchMock as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createUniverse', () => {
    it('should POST documents to create universe', async () => {
      const mockResponse = { universeId: 'universe-123', status: 'processing' };
      fetchMock.mockResolvedValue({
        json: () => Promise.resolve(mockResponse),
      });

      const documents = [{ filename: 'test.txt', content: 'Hello', mimeType: 'text/plain' }];
      const result = await api.createUniverse(documents);

      expect(fetchMock).toHaveBeenCalledWith('/api/universe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents, config: {} }),
      });
      expect(result).toEqual(mockResponse);
    });

    it('should include config when provided', async () => {
      fetchMock.mockResolvedValue({
        json: () => Promise.resolve({ universeId: 'u-1' }),
      });

      const documents = [{ filename: 'test.txt', content: 'Hello', mimeType: 'text/plain' }];
      const config = { targetEmailCount: 100 };
      await api.createUniverse(documents, config);

      expect(fetchMock).toHaveBeenCalledWith('/api/universe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents, config }),
      });
    });
  });

  describe('getStatus', () => {
    it('should GET universe status', async () => {
      const mockStatus = {
        universeId: 'universe-123',
        status: 'processing',
        progress: { phase: 'documents', percentComplete: 50 },
      };
      fetchMock.mockResolvedValue({
        json: () => Promise.resolve(mockStatus),
      });

      const result = await api.getStatus('universe-123');

      expect(fetchMock).toHaveBeenCalledWith('/api/universe/universe-123/status');
      expect(result).toEqual(mockStatus);
    });
  });

  describe('getEmails', () => {
    it('should GET all emails without folder filter', async () => {
      const mockEmails = { emails: [], folders: [], threads: [], characters: [] };
      fetchMock.mockResolvedValue({
        json: () => Promise.resolve(mockEmails),
      });

      await api.getEmails('universe-123');

      expect(fetchMock).toHaveBeenCalledWith('/api/universe/universe-123/emails');
    });

    it('should GET emails with folder filter', async () => {
      const mockEmails = { emails: [], folders: [], threads: [], characters: [] };
      fetchMock.mockResolvedValue({
        json: () => Promise.resolve(mockEmails),
      });

      await api.getEmails('universe-123', 'inbox');

      expect(fetchMock).toHaveBeenCalledWith('/api/universe/universe-123/emails?folder=inbox');
    });
  });

  describe('markRead', () => {
    it('should PATCH email as read', async () => {
      fetchMock.mockResolvedValue({
        json: () => Promise.resolve({ success: true }),
      });

      await api.markRead('universe-123', 'email-456');

      expect(fetchMock).toHaveBeenCalledWith('/api/universe/universe-123/emails/email-456/read', {
        method: 'PATCH',
      });
    });
  });

  describe('toggleStar', () => {
    it('should PATCH email star status', async () => {
      const mockResponse = { success: true, isStarred: true };
      fetchMock.mockResolvedValue({
        json: () => Promise.resolve(mockResponse),
      });

      const result = await api.toggleStar('universe-123', 'email-456');

      expect(fetchMock).toHaveBeenCalledWith('/api/universe/universe-123/emails/email-456/star', {
        method: 'PATCH',
      });
      expect(result).toEqual(mockResponse);
    });
  });
});
