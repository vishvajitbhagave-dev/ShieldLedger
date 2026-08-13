// Frontend error monitoring.
//
// Production-grade error tracking via Sentry, enabled at build time with a DSN:
//     VITE_SENTRY_DSN=<dsn> npm run build
//
// Without a DSN every function degrades to a no-op (plus a bounded in-memory
// ring buffer surfaced to the console) so the DApp is fully functional in
// development and in preview builds that have not configured monitoring yet.
// Nothing is ever sent anywhere unless a DSN is explicitly provided.

import * as Sentry from '@sentry/browser';

/** How many recent errors to remember locally while no DSN is configured. */
const RING_BUFFER_SIZE = 20;

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const release = (import.meta.env.VITE_APP_RELEASE as string | undefined) || 'dev';
const environment = (import.meta.env.VITE_NETWORK_ID as string | undefined) ?? 'undeployed';

const recentErrors: Array<{ at: string; message: string }> = [];

let initialized = false;

/** Initializes Sentry if a DSN is configured and wires global handlers. */
export const initMonitoring = (): void => {
  if (!initialized) {
    initialized = true;
    if (dsn) {
      Sentry.init({
        dsn,
        environment,
        release,
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
      });
    }
    window.addEventListener('error', (event) => {
      captureError(event.error ?? new Error(event.message));
    });
    window.addEventListener('unhandledrejection', (event) => {
      captureError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
    });
  }
};

const remember = (error: Error, context?: Record<string, unknown>): void => {
  recentErrors.push({
    at: new Date().toISOString(),
    message: `${error.message}${context ? ` — ${JSON.stringify(context)}` : ''}`,
  });
  if (recentErrors.length > RING_BUFFER_SIZE) recentErrors.shift();
  // eslint-disable-next-line no-console
  console.debug('[monitoring] captured:', error.message, context ?? '');
};

/**
 * Reports an unexpected error to the configured error tracker.
 * Safe to call from anywhere; never throws.
 */
export const captureError = (error: unknown, context?: Record<string, unknown>): void => {
  const normalized = error instanceof Error ? error : new Error(String(error));
  if (dsn) {
    Sentry.captureException(normalized, { contexts: context ? { app: context } : undefined });
  } else {
    remember(normalized, context);
  }
};

/** Reports a non-fatal warning/message to the configured error tracker. */
export const captureMessage = (level: 'info' | 'warning' | 'error', message: string): void => {
  if (dsn) {
    Sentry.captureMessage(message, level);
  } else {
    remember(new Error(message));
  }
};

/** In-memory view of recent errors (useful for a hidden diagnostics panel). */
export const getRecentErrors = (): ReadonlyArray<{ at: string; message: string }> => recentErrors;
