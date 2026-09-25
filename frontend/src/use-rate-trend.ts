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
import { demoState$ } from './lib/demo-ledger.js';
import type { InvoiceView, ShieldLedgerDerivedState } from './shield-ledger-types.js';

export interface RateTrendState {
  readonly records: readonly RateTrendRecord[];
  /** Records whose financing transition was observed during THIS session. */
  readonly sessionCount: number;
  readonly error: string | null;
  /** Clears this browser's local trend records (storage + memory). */
  readonly reset: () => void;
}

export const useRateTrend = (): RateTrendState => {
  const { deployment, demo } = useShieldLedger();
  const api = deployment.status === 'deployed' ? deployment.api : null;
  const [records, setRecords] = useState<readonly RateTrendRecord[]>(() =>
    demo ? [] : loadRateTrendRecords(),
  );
  const [sessionCount, setSessionCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recordsRef = useRef(records);
  const prevInvoicesRef = useRef<readonly InvoiceView[] | null>(null);
  const bootstrappedRef = useRef(false);
  const sessionSeenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (demo) {
      bootstrappedRef.current = false;
      prevInvoicesRef.current = null;
      const subscription = demoState$.subscribe({
        next: (state) => handleNext(state, false),
        error: (e) => setError(e instanceof Error ? e.message : String(e)),
      });
      return () => subscription.unsubscribe();
    }
    if (!api) return;
    bootstrappedRef.current = false;
    prevInvoicesRef.current = null;

    const subscription = api.state$.subscribe({
      next: (state) => handleNext(state, true),
      error: (e) => setError(e instanceof Error ? e.message : String(e)),
    });

    return () => subscription.unsubscribe();
    // handleNext only closes over refs and setters, so it is intentionally
    // excluded from the deps to keep the subscription stable per source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, demo]);

  const handleNext = (state: ShieldLedgerDerivedState, persist: boolean): void => {
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
    if (persist) persistRateTrendRecords(nextRecords);
  };

  // Reset clears every record. In demo mode the records were never persisted
  // (they live only in this browser's memory), so the real storage is left
  // untouched — demo activity must never pollute live trend data.
  const reset = useCallback(() => {
    if (!demo) clearRateTrendRecords();
    sessionSeenRef.current = new Set();
    recordsRef.current = [];
    setRecords([]);
    setSessionCount(0);
  }, [demo]);

  return { records, sessionCount, error, reset };
};