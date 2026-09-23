// Date/time display helpers shared across the DApp UI.

/**
 * Format an on-chain timestamp (Unix seconds, UTC) as dd-mm-yyyy.
 *
 * Invoice due dates are stored on-chain as whole days in seconds; formatting
 * in UTC keeps the exact calendar date the picker produced (the same UTC
 * convention used by the date inputs via unixSecondsToDateInput). Renders
 * '—' for unset/invalid timestamps (<= 0).
 */
export const unixSecondsToDmy = (unixSeconds: bigint | number): string => {
  const seconds = typeof unixSeconds === 'bigint' ? unixSeconds : BigInt(Math.trunc(unixSeconds));
  if (seconds <= 0n) return '—';
  const d = new Date(Number(seconds) * 1000);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
};
