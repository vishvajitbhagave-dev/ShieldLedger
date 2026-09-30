import { describe, it, expect } from 'vitest';
import { HIGHLIGHT_MS, isWithinHighlightWindow } from '../frontend/src/highlight';

const NOW = 1_000_000_000_000;

describe('isWithinHighlightWindow', () => {
  it('never highlights entries that were never freshly observed', () => {
    expect(isWithinHighlightWindow(undefined, NOW)).toBe(false);
  });

  it('highlights an entry that was just added (age < window)', () => {
    expect(isWithinHighlightWindow(NOW - 10, NOW)).toBe(true);
    expect(isWithinHighlightWindow(NOW - HIGHLIGHT_MS + 1, NOW)).toBe(true);
  });

  it('stops highlighting once the window has passed', () => {
    expect(isWithinHighlightWindow(NOW - HIGHLIGHT_MS, NOW)).toBe(false);
    expect(isWithinHighlightWindow(NOW - 60_000, NOW)).toBe(false);
  });

  it('does not highlight timestamps from the future', () => {
    expect(isWithinHighlightWindow(NOW + 500, NOW)).toBe(false);
  });
});