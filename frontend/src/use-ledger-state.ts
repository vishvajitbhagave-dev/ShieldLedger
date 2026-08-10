import { useEffect, useState } from 'react';
import { useShieldLedger } from './context.js';
import type { ShieldLedgerDerivedState } from './shield-ledger-types.js';

/** Subscribes to the deployed contract's derived ledger state. */
export const useLedgerState = (): { state: ShieldLedgerDerivedState | null; error: string | null } => {
  const { deployment } = useShieldLedger();
  const api = deployment.status === 'deployed' ? deployment.api : null;
  const [state, setState] = useState<ShieldLedgerDerivedState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!api) return;
    const subscription = api.state$.subscribe({
      next: (s) => {
        setState(s);
        setError(null);
      },
      error: (e) => setError(e instanceof Error ? e.message : String(e)),
    });
    return () => subscription.unsubscribe();
  }, [api]);

  return { state, error };
};
