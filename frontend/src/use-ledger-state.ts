import { useCallback, useEffect, useRef, useState } from 'react';
import { useShieldLedger } from './context.js';
import type { ShieldLedgerDerivedState } from './shield-ledger-types.js';
import { demoState$ } from './lib/demo-ledger.js';
import { LEDGER_STREAM_STALL_MARKER } from './lib/errorMessages.js';
import {
  subscribeLedgerState,
  type LedgerStreamController,
} from './ledger-stream.js';

/** How long the "Waiting for ledger state…" shell may stay silent before we surface a stall. */
export const LEDGER_STATE_TIMEOUT_MS = 20_000;

/** Automatic resubscribe attempts after a stall before we give up and wait for a manual retry. */
export const LEDGER_RETRY_ATTEMPTS = 2;

/** Backoff between automatic resubscribes, in milliseconds. */
export const LEDGER_RETRY_BACKOFF_MS = [2_000, 5_000];

export interface UseLedgerStateResult {
  state: ShieldLedgerDerivedState | null;
  error: string | null;
  /** Manually restart the subscription (clears the stall error immediately). */
  retry: () => void;
}

/**
 * Subscribes to the deployed contract's derived ledger state with stall
 * detection and retry. The shared source is a WebSocket subscription to the
 * indexer that can go quietly silent (no error, no completion) — without this,
 * consumers would sit on "Waiting for ledger state…" forever. Each consumer
 * gets its own stall timer, but auto-retry + the exposed `retry()` cover all
 * of them because they share this single hook.
 */
export const useLedgerState = (): UseLedgerStateResult => {
  const { deployment, demo } = useShieldLedger();
  const api = deployment.status === 'deployed' ? deployment.api : null;
  const [state, setState] = useState<ShieldLedgerDerivedState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<LedgerStreamController<ShieldLedgerDerivedState> | null>(null);

  useEffect(() => {
    // Demo Mode: the simulated store is a BehaviorSubject — it emits the
    // seeded state immediately and on every demo mutation, no stalls possible.
    if (demo) {
      setState(null);
      setError(null);
      const subscription = demoState$.subscribe({
        next: (s) => {
          setError(null);
          setState(s);
        },
        error: (e) => setError(e instanceof Error ? e.message : String(e)),
      });
      return () => subscription.unsubscribe();
    }
    if (!api) return;
    setState(null);
    setError(null);
    const controller = subscribeLedgerState<ShieldLedgerDerivedState>(
      api.state$,
      {
        onValue: (s) => {
          setError(null);
          setState(s);
        },
        onStall: (detail) => {
          setError(
            `${LEDGER_STREAM_STALL_MARKER} The live ledger stream stopped updating: ${detail}`,
          );
        },
      },
      {
        timeoutMs: LEDGER_STATE_TIMEOUT_MS,
        retryAttempts: LEDGER_RETRY_ATTEMPTS,
        retryBackoffMs: LEDGER_RETRY_BACKOFF_MS,
      },
    );
    controllerRef.current = controller;
    return () => {
      controller.stop();
      controllerRef.current = null;
    };
  }, [api, demo]);

  const retry = useCallback(() => {
    setError(null);
    controllerRef.current?.retry();
  }, []);

  return { state, error, retry };
};