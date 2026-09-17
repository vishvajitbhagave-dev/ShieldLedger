import { describe, it, expect, vi, afterEach } from 'vitest';
import { Observable, Subject } from 'rxjs';

import { subscribeLedgerState } from '../frontend/src/ledger-stream.js';

/**
 * A source whose every subscription is a fresh inner Subject, so we can
 * simulate a real reconnect (each resubscribe gets a new underlying stream)
 * and emit values/errors into whichever inner stream is current.
 */
const makeSource = (): {
  source: Observable<number>;
  next: (value: number) => void;
  error: (err: unknown) => void;
  complete: () => void;
  count: () => number;
} => {
  const inners: Subject<number>[] = [];
  const source = new Observable<number>((subscriber) => {
    const inner = new Subject<number>();
    inners.push(inner);
    const subscription = inner.subscribe(subscriber);
    return () => subscription.unsubscribe();
  });
  return {
    source,
    next: (value) => inners[inners.length - 1].next(value),
    error: (err) => inners[inners.length - 1].error(err),
    complete: () => inners[inners.length - 1].complete(),
    count: () => inners.length,
  };
};

const OPTIONS = { timeoutMs: 1000, retryAttempts: 2, retryBackoffMs: [100, 300] };

describe('subscribeLedgerState — timeout + retry resilience for the live ledger stream', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('forwards values on the happy path while the stream keeps delivering', () => {
    vi.useFakeTimers();
    const { source, next } = makeSource();
    const values: number[] = [];
    const stalls: string[] = [];
    const controller = subscribeLedgerState(source, {
      onValue: (v) => values.push(v),
      onStall: (d) => stalls.push(d),
    }, OPTIONS);

    // Feed a value every 500ms — each one re-arms the 1000ms stall timer, so
    // a live stream never trips it.
    for (let i = 1; i <= 20; i += 1) {
      next(i);
      vi.advanceTimersByTime(500);
    }
    expect(values).toHaveLength(20);
    expect(values[0]).toBe(1);
    expect(values[19]).toBe(20);
    expect(stalls).toEqual([]);
    controller.stop();
  });

  it('flags a silent start after the timeout and auto-resubscribes after backoff', () => {
    vi.useFakeTimers();
    const { source, next, count } = makeSource();
    const values: number[] = [];
    const stalls: string[] = [];
    const controller = subscribeLedgerState(source, {
      onValue: (v) => values.push(v),
      onStall: (d) => stalls.push(d),
    }, OPTIONS);

    expect(count()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(stalls).toEqual(['no ledger state arrived in time']);
    expect(count()).toBe(1); // not resubscribed until the backoff elapses
    vi.advanceTimersByTime(100);
    expect(count()).toBe(2);
    next(42);
    expect(values).toEqual([42]);
    controller.stop();
  });

  it('stops auto-resubscribing after the retry budget is exhausted', () => {
    vi.useFakeTimers();
    const { source, count } = makeSource();
    const stalls: string[] = [];
    const controller = subscribeLedgerState(source, {
      onValue: () => undefined,
      onStall: (d) => stalls.push(d),
    }, OPTIONS);

    vi.advanceTimersByTime(1000); // stall 1
    vi.advanceTimersByTime(100);  // resubscribe
    vi.advanceTimersByTime(1000); // stall 2
    vi.advanceTimersByTime(300);  // resubscribe
    vi.advanceTimersByTime(1000); // stall 3 — budget spent
    expect(stalls).toHaveLength(3);
    expect(count()).toBe(3);

    vi.advanceTimersByTime(60_000);
    expect(count()).toBe(3); // no further automatic restarts
    expect(stalls).toHaveLength(3);
    controller.stop();
  });

  it('manual retry() restarts immediately with a fresh auto-retry budget', () => {
    vi.useFakeTimers();
    const { source, count } = makeSource();
    const stalls: string[] = [];
    const controller = subscribeLedgerState(source, {
      onValue: () => undefined,
      onStall: (d) => stalls.push(d),
    }, OPTIONS);

    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(100);
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(300);
    vi.advanceTimersByTime(1000);
    expect(count()).toBe(3); // budget exhausted

    controller.retry();
    expect(count()).toBe(4); // immediate manual restart
    vi.advanceTimersByTime(1000);
    expect(stalls).toHaveLength(4); // fresh budget — auto-retry kicks in again
    vi.advanceTimersByTime(100);
    expect(count()).toBe(5);
    controller.stop();
  });

  it('surfaces stream errors as stalls and recovers on the resubscribed stream', () => {
    vi.useFakeTimers();
    const { source, next, error, count } = makeSource();
    const values: number[] = [];
    const stalls: string[] = [];
    const controller = subscribeLedgerState(source, {
      onValue: (v) => values.push(v),
      onStall: (d) => stalls.push(d),
    }, OPTIONS);

    next(1);
    error(new Error('boom'));
    expect(stalls).toEqual(['boom']);
    expect(count()).toBe(1);
    vi.advanceTimersByTime(100);
    expect(count()).toBe(2); // auto-resubscribe after the stream error

    next(2);
    expect(values).toEqual([1, 2]);
    controller.stop();
  });

  it('treats a stream that closes without data as a stall and auto-resubscribes', () => {
    vi.useFakeTimers();
    const { source, complete, count } = makeSource();
    const stalls: string[] = [];
    const controller = subscribeLedgerState(source, {
      onValue: () => undefined,
      onStall: (d) => stalls.push(d),
    }, OPTIONS);

    complete();
    expect(stalls).toHaveLength(1);
    expect(stalls[0]).toContain('closed without delivering state');
    vi.advanceTimersByTime(100);
    expect(count()).toBe(2);
    controller.stop();
  });

  it('re-arms the stall timer after each value, so a post-data silence is also caught', () => {
    vi.useFakeTimers();
    const { source, next } = makeSource();
    const values: number[] = [];
    const stalls: string[] = [];
    const controller = subscribeLedgerState(source, {
      onValue: (v) => values.push(v),
      onStall: (d) => stalls.push(d),
    }, OPTIONS);

    next(1);
    vi.advanceTimersByTime(500);
    next(2); // timer re-arms
    vi.advanceTimersByTime(1000); // now silent past the timeout
    expect(values).toEqual([1, 2]);
    expect(stalls).toEqual(['no ledger state arrived in time']);
    controller.stop();
  });

  it('stop() cancels pending timers and the subscription so nothing fires later', () => {
    vi.useFakeTimers();
    const { source, count } = makeSource();
    const stalls: string[] = [];
    const controller = subscribeLedgerState(source, {
      onValue: () => undefined,
      onStall: (d) => stalls.push(d),
    }, OPTIONS);

    controller.stop();
    vi.advanceTimersByTime(60_000);
    expect(stalls).toEqual([]);
    expect(count()).toBe(1); // no resubscribe was attempted
  });

  it('does not resubscribe after stop() even if an auto-retry was already pending', () => {
    vi.useFakeTimers();
    const { source, count } = makeSource();
    const controller = subscribeLedgerState(source, {
      onValue: () => undefined,
      onStall: () => undefined,
    }, OPTIONS);

    vi.advanceTimersByTime(1000); // stall → backoff timer armed
    controller.stop();
    vi.advanceTimersByTime(100);
    expect(count()).toBe(1);
  });
});