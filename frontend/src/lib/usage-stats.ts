/// <reference types="vite/client" />
// Lightweight, privacy-preserving aggregate usage stats.
//
// Writes a single anonymized `session_start` event to a Supabase table so the
// project can report platform-wide totals such as "unique users". Configuration
// is entirely build-time:
//
//     VITE_SUPABASE_URL=https://<project>.supabase.co
//     VITE_SUPABASE_ANON_KEY=<publishable / anon key>
//
// With either variable unset every function is a no-op: no client is created,
// no request is made, and the app behaves exactly as it does without this
// module. The Supabase client is imported lazily so it is not even bundled into
// builds that do not enable this layer.
//
// PRIVACY: the only identifier ever sent is a random per-browser id kept in
// localStorage (never derived from a wallet address). Events carry no wallet,
// role, invoice, bid or amount data — those stay in the separate Plausible sink
// (lib/analytics.ts) and never reach this table.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const appRelease = (import.meta.env.VITE_APP_RELEASE as string | undefined) ?? 'dev';

const enabled = Boolean(url && anonKey);

export const usageStatsEnabled = enabled;

/** localStorage key holding the random, wallet-independent per-browser id. */
export const SUBJECT_STORAGE_KEY = 'shieldledger.subject_id';

/**
 * Returns the stable per-browser dedup id, generating and persisting it on
 * first use. Never derived from any wallet or on-chain value.
 */
const subjectId = (): string | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const existing = localStorage.getItem(SUBJECT_STORAGE_KEY);
    if (existing) return existing;
    if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') return null;
    const generated = crypto.randomUUID();
    localStorage.setItem(SUBJECT_STORAGE_KEY, generated);
    return generated;
  } catch {
    return null;
  }
};

type SupabaseClientLike = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<unknown>;
  };
};

let clientPromise: Promise<SupabaseClientLike> | null = null;

const getClient = (): Promise<SupabaseClientLike> => {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(url!, anonKey!, { auth: { persistSession: false } }) as unknown as SupabaseClientLike,
    );
  }
  return clientPromise;
};

const recordSessionStart = async (network: string): Promise<void> => {
  const id = subjectId();
  if (!id) return;
  const supabase = await getClient();
  await supabase.from('usage_events').insert({
    event_type: 'session_start',
    subject_id: id,
    network,
    app_release: appRelease,
  });
};

/**
 * Records a single anonymous `session_start` event on a successful wallet
 * connect. Best-effort and fire-and-forget: failures are swallowed so analytics
 * can never break the application. No-op when the layer is not configured.
 */
export const trackSessionStart = (network: string): void => {
  if (!enabled) return;
  void recordSessionStart(network).catch(() => {
    // Analytics must never break the application.
  });
};
