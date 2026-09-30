// Pure view logic for the Public Ledger's new-entry highlight — kept outside
// the React component so it can be unit-tested without a DOM. See
// tests/highlight.test.ts.

/** How long a freshly-observed ledger entry stays highlighted (milliseconds). */
export const HIGHLIGHT_MS = 4000;

/**
 * True while an entry is still inside its highlight window.
 *
 * `seenAt` is undefined for entries that were never freshly observed (so they
 * are never highlighted), and `now` is injected by the caller rather than read
 * from the clock so the timing stays deterministic in tests.
 */
export function isWithinHighlightWindow(
  seenAt: number | undefined,
  now: number,
  highlightMs: number = HIGHLIGHT_MS,
): boolean {
  if (seenAt === undefined) return false;
  const age = now - seenAt;
  return age >= 0 && age < highlightMs;
}