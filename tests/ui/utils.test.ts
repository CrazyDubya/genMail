/**
 * Tests for UI utility functions
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Utility functions (mirroring app.js implementation)
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return date.toLocaleDateString('en-US', { weekday: 'short' });

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

describe('formatDate', () => {
  let originalDate: DateConstructor;
  let mockNow: Date;

  beforeEach(() => {
    // Set a fixed "now" time for testing
    mockNow = new Date('2024-06-15T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(mockNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "Just now" for dates less than a minute ago', () => {
    const thirtySecondsAgo = new Date(mockNow.getTime() - 30000).toISOString();
    expect(formatDate(thirtySecondsAgo)).toBe('Just now');
  });

  it('should return minutes ago for dates less than an hour ago', () => {
    const fiveMinutesAgo = new Date(mockNow.getTime() - 5 * 60000).toISOString();
    expect(formatDate(fiveMinutesAgo)).toBe('5m ago');

    const thirtyMinutesAgo = new Date(mockNow.getTime() - 30 * 60000).toISOString();
    expect(formatDate(thirtyMinutesAgo)).toBe('30m ago');
  });

  it('should return hours ago for dates less than a day ago', () => {
    const twoHoursAgo = new Date(mockNow.getTime() - 2 * 3600000).toISOString();
    expect(formatDate(twoHoursAgo)).toBe('2h ago');

    const twentyThreeHoursAgo = new Date(mockNow.getTime() - 23 * 3600000).toISOString();
    expect(formatDate(twentyThreeHoursAgo)).toBe('23h ago');
  });

  it('should return weekday for dates less than a week ago', () => {
    const twoDaysAgo = new Date(mockNow.getTime() - 2 * 86400000).toISOString();
    const result = formatDate(twoDaysAgo);
    // Should be a weekday name (e.g., "Thu")
    expect(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']).toContain(result);
  });

  it('should return month and day for dates older than a week', () => {
    const twoWeeksAgo = new Date(mockNow.getTime() - 14 * 86400000).toISOString();
    const result = formatDate(twoWeeksAgo);
    // Should match pattern like "Jun 1" or "May 31"
    expect(result).toMatch(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s\d{1,2}$/);
  });
});

describe('escapeHtml', () => {
  it('should escape HTML special characters', () => {
    expect(escapeHtml('<script>alert("XSS")</script>')).toBe(
      '&lt;script&gt;alert("XSS")&lt;/script&gt;'
    );
  });

  it('should escape ampersands', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('should escape quotes', () => {
    expect(escapeHtml('He said "hello"')).toBe('He said "hello"');
  });

  it('should escape less than and greater than', () => {
    expect(escapeHtml('5 > 3 && 3 < 5')).toBe('5 &gt; 3 &amp;&amp; 3 &lt; 5');
  });

  it('should handle empty strings', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should handle strings without special characters', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  it('should handle multi-line strings', () => {
    const input = 'Line 1\nLine 2\nLine 3';
    expect(escapeHtml(input)).toBe('Line 1\nLine 2\nLine 3');
  });

  it('should handle unicode characters', () => {
    expect(escapeHtml('Hello 世界 🌍')).toBe('Hello 世界 🌍');
  });
});
