// Live observer for the forward-only rate trend.
//
// Subscribes to the deployed contract's state stream and, on every emission
// AFTER the first (the baseline), detects invoices that just became financed
// with a public single-lender rate. Each detection is stamped with the moment
// THIS browser observed it and appended to the browser-local record list.
//
// First emission = baseline only: whatever is already financed predates this
// browser's observation window and is never back-filled, keeping the trend
// honestly forward-only.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useShieldLedger } from './context.js';
import {
  detectNewlyFinanced,
  recordFor,
  type RateTrendRecord,
} from './rate-trend.js';
import {
  clearRateTrendRecords,
  loadRateTrendRecords,
  persistRateTrendRecords,
} from './rate-trend-store.js';
import type { InvoiceView } from './shield-ledger-types.js';

export interface RateTrendState {
  readonly records: readonly RateTrendRecord[];
  /** Records whose financing transition was observed during THIS session. */
  readonly sessionCount: number;
  readonly error: string | null;
  /** Clears this browser's local trend records (storage + memory). */
  readonly reset: () => void;
}

export const useRateTrend = (): RateTrendState => {
  const { deployment } = useShieldLedger();
  const api = deployment.status === 'deployed' ? deployment.api : null;
  const [records, setRecords] = useState<readonly RateTrendRecord[]>(() => loadRateTrendRecords());
  const [sessionCount, setSessionCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recordsRef = useRef(records);
  const prevInvoicesRef = useRef<readonly InvoiceView[] | null>(null);
  const bootstrappedRef = useRef(false);
  const sessionSeenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!api) return;
    bootstrappedRef.current = false;
    prevInvoicesRef.current = null;

    const subscription = api.state$.subscribe({
      next: (state) => {
        if (!bootstrappedRef.current) {
          prevInvoicesRef.current = state.invoices;
          bootstrappedRef.current = true;
          return;
        }
        const prev = prevInvoicesRef.current ?? [];
        prevInvoicesRef.current = state.invoices;

        const transitions = detectNewlyFinanced(prev, state.invoices);
        if (transitions.length === 0) return;

        const seen = new Set(recordsRef.current.map((r) => r.nullifier));
        const observedAtMs = Date.now();
        const fresh: RateTrendRecord[] = [];
        for (const t of transitions) {
          if (seen.has(t.nullifier)) continue;
          seen.add(t.nullifier);
          sessionSeenRef.current.add(t.nullifier);
          fresh.push(recordFor(t, observedAtMs));
        }
        if (fresh.length === 0) return;

        const nextRecords = [...recordsRef.current, ...fresh];
        recordsRef.current = nextRecords;
        setRecords(nextRecords);
        setSessionCount(sessionSeenRef.current.size);
        persistRateTrendRecords(nextRecords);
      },
      error: (e) => setError(e instanceof Error ? e.message : String(e)),
    });

    return () => subscription.unsubscribe();
  }, [api]);

  const reset = useCallback(() => {
    clearRateTrendRecords();
    sessionSeenRef.current = new Set();
    recordsRef.current = [];
    setRecords([]);
    setSessionCount(0);
  }, []);

  return { records, sessionCount, error, reset };
};