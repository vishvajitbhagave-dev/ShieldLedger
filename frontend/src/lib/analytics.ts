// Lightweight privacy-friendly analytics.
//
// Sends page views and custom events to a Plausible-compatible endpoint, e.g.
// Plausible (https://plausible.io) or any self-hosted ingest that speaks the
// same protocol. Configuration is entirely build-time:
//
//     VITE_ANALYTICS_DOMAIN=shieldledger.example.com  (site id registered upstream)
//     VITE_ANALYTICS_ENDPOINT=https://plausible.io/api/event  (optional override)
//
// With neither variable set every call is a no-op: no beacon is ever fired and
// no third-party request is made, so local and preview builds stay clean.
//
// The beacon is a plain `navigator.sendBeacon` POST (no cookies, no client
// storage); the data shared is exactly the event name plus a handful of
// non-identifying context fields.

const domain = import.meta.env.VITE_ANALYTICS_DOMAIN as string | undefined;
const endpoint = (import.meta.env.VITE_ANALYTICS_ENDPOINT as string | undefined) ?? 'https://plausible.io/api/event';

const enabled = Boolean(domain && typeof navigator !== 'undefined');

export const analyticsEnabled = enabled;

const send = (payload: Record<string, unknown>): void => {
  if (!enabled) return;
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    if (typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(endpoint, blob)) return;
    }
    void fetch(endpoint, { method: 'POST', body: blob, keepalive: true });
  } catch {
    // Analytics must never break the application.
  }
};

const pageUrl = (): string => window.location.href;
const referrer = (): string => document.referrer;

/**
 * Tracks a named user event. `props` are optional key/value dimensions
 * (e.g. `{ role: 'sme', outcome: 'success' }`).
 */
export const track = (eventName: string, props?: Record<string, string | number | boolean>): void => {
  if (!enabled) return;
  send({
    name: eventName,
    domain,
    url: pageUrl(),
    referrer: referrer(),
    props,
  });
};

/** Tracks a page view (called once per app mount, and on route changes). */
export const trackPageView = (): void => {
  if (!enabled) return;
  send({
    name: 'pageview',
    domain,
    url: pageUrl(),
    referrer: referrer(),
    props: { network: (import.meta.env.VITE_NETWORK_ID as string | undefined) ?? 'undeployed' },
  });
};
