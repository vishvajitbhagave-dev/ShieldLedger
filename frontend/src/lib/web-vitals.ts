// Core Web Vitals collection.
//
// Collects CLS, LCP, INP and FCP using the browser PerformanceObserver API (no
// extra dependency) and forwards them to the configured sinks: the error
// monitor (as a non-fatal message) and, when analytics are enabled, as a
// `web_vital` event. This is how we keep an eye on production performance.

import { analyticsEnabled, track } from './analytics.js';
import { captureMessage } from './monitoring.js';

type VitalName = 'CLS' | 'LCP' | 'INP' | 'FCP';

const reportVital = (name: VitalName, value: number): void => {
  const rounded = Math.round(value * 1000) / 1000;
  captureMessage('info', `web-vital ${name}: ${rounded}`);
  if (analyticsEnabled) {
    track('web_vital', { name, value: String(rounded) });
  }
};

const observe = <Metric extends { value: number }>(
  type: string,
  name: VitalName,
  applyCorrection: (entry: Metric) => number = (entry) => entry.value,
): void => {
  if (!('PerformanceObserver' in window)) return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as Metric[]) {
        reportVital(name, applyCorrection(entry));
      }
    });
    observer.observe({ type, buffered: true });
  } catch {
    // The metric type is unsupported in this browser — skip it quietly.
  }
};

/** Starts passive web-vitals collection. Safe to call on every mount. */
export const startWebVitals = (): void => {
  observe('layout-shift', 'CLS');
  observe('largest-contentful-paint', 'LCP', (entry) => {
    const metric = entry as unknown as { startTime?: number };
    return metric.startTime ?? 0;
  });
  observe('first-contentful-paint', 'FCP', (entry) => {
    const metric = entry as unknown as { startTime?: number };
    return metric.startTime ?? 0;
  });
  observe('event', 'INP', (entry) => {
    const metric = entry as unknown as { duration?: number };
    return metric.duration ?? 0;
  });
};
