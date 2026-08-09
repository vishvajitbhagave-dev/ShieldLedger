import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

import * as ShieldLedgerContract from '../contracts/managed/shield-ledger/contract/index.js';
import { witnesses, type ShieldLedgerPrivateState } from './witnesses.js';

export const compiledShieldLedgerContract = CompiledContract.make<
  ShieldLedgerContract.Contract<ShieldLedgerPrivateState>
>('shield-ledger', ShieldLedgerContract.Contract<ShieldLedgerPrivateState>).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets('./contracts/managed/shield-ledger'),
);
