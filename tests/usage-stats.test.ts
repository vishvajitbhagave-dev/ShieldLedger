import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The module decides whether it is enabled at import time from
// import.meta.env, so each test resets modules and stubs the env accordingly.

describe('lib/usage-stats — disabled by default', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('reports disabled and makes no network call when env vars are absent', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const mod = await import('../frontend/src/lib/usage-stats.js');

    expect(mod.usageStatsEnabled).toBe(false);

    // Even when called, it must not reach out anywhere.
    mod.trackSessionStart('preprod');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
