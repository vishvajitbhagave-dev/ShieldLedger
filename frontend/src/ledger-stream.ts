import { type Observable, type Subscription } from 'rxjs';

/** Callbacks the ledger subscription controller invokes as the stream evolves. */
export interface LedgerStreamHandlers<T> {
  /** A fresh ledger state value arrived. */
  onValue: (value: T) => void;
  /** The stream stalled (silent for too long, errored, or closed) without a value. */
  onStall: (detail: string) => void;
}

export interface LedgerStreamController<T> {
  /** (Re)start listening to the source stream. */
  start: () => void;
  /** Tear down the subscription and cancel pending timers. */
  stop: () => void;
  /** Immediately restart listening, refreshing the auto-retry budget. */
  retry: () => void;
}

export interface LedgerStreamOptions {
  /** How long to wait for the next value before calling onStall. */
  timeoutMs: number;
  /** How many automatic restarts to attempt after a stall before giving up. */
  retryAttempts: number;
  /** Backoff between automatic restarts, in milliseconds. */
  retryBackoffMs: readonly number[];
}

/**
 * Wraps a ledger state stream (an rxjs Observable) with timeout + retry
 * resilience. The underlying indexer WebSocket subscription can go silent
 * without erroring or completing (dropped connection, exhausted reconnect
 * backoff), which would otherwise leave the UI on its loading shell forever.
 * This controller surfaces the silence as `onStall`, restarts the subscription
 * up to `retryAttempts` times with backoff, and exposes a manual `retry()`.
 *
 * Framework-free so it can be unit-tested without a React renderer.
 */
export const subscribeLedgerState = <T>(
  source$: Observable<T>,
  handlers: LedgerStreamHandlers<T>,
  options: LedgerStreamOptions,
): LedgerStreamController<T> => {
  let subscription: Subscription | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attemptsLeft = options.retryAttempts;
  let stopped = false;

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const scheduleAutoRetry = (): void => {
    if (attemptsLeft <= 0 || stopped) return;
    attemptsLeft -= 1;
    const index = options.retryAttempts - attemptsLeft - 1;
    const delay =
      options.retryBackoffMs[index] ?? options.retryBackoffMs[options.retryBackoffMs.length - 1];
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      if (!stopped) start();
    }, delay);
  };

  const armTimer = (): void => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      if (stopped) return;
      // No value within the window — treat the stream as stalled.
      handlers.onStall('no ledger state arrived in time');
      scheduleAutoRetry();
    }, options.timeoutMs);
  };

  const start = (): void => {
    if (stopped) return;
    clearTimer();
    subscription?.unsubscribe();
    subscription = source$.subscribe({
      next: (value) => {
        if (stopped) return;
        attemptsLeft = options.retryAttempts;
        handlers.onValue(value);
        armTimer();
      },
      error: (error) => {
        if (stopped) return;
        handlers.onStall(error instanceof Error ? error.message : String(error));
        scheduleAutoRetry();
      },
      complete: () => {
        if (stopped) return;
        handlers.onStall('the live ledger stream closed without delivering state');
        scheduleAutoRetry();
      },
    });
    armTimer();
  };

  const stop = (): void => {
    stopped = true;
    clearTimer();
    subscription?.unsubscribe();
    subscription = null;
  };

  const retry = (): void => {
    if (stopped) return;
    clearTimer();
    attemptsLeft = options.retryAttempts;
    start();
  };

  start();

  return { start, stop, retry };
};