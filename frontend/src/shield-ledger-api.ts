// Adapts a deployed (or newly deployed) ShieldLedger contract into a small
// typed API for the browser DApp: exposes the derived ledger state as an
// observable, and thin wrappers over the three impure circuits.
import * as ShieldLedger from '../../contracts/managed/shield-ledger/contract/index.js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { type ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { from, map, type Observable } from 'rxjs';

import { compiledShieldLedgerContract } from '../../src/compiled.js';
import { createShieldLedgerPrivateState, type ShieldLedgerPrivateState } from '../../src/witnesses.js';
import {
  shieldLedgerPrivateStateKey,
  type DeployedShieldLedgerContract,
  type ShieldLedgerDerivedState,
  type ShieldLedgerProviders,
} from './shield-ledger-types.js';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(input: string): Uint8Array {
  const hex = input.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error('Expected exactly 64 hex characters (32 bytes).');
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toDerivedState(state: Parameters<typeof ShieldLedger.ledger>[0]): ShieldLedgerDerivedState {
  const lg = ShieldLedger.ledger(state);
  const invoices = Array.from(lg.invoices, ([nullifier, invoice]) => ({
    nullifier: toHex(nullifier),
    smeCommitment: toHex(invoice.smeCommitment),
    lender: invoice.lender.is_some ? toHex(invoice.lender.value) : null,
    amount: invoice.amount,
    dueDate: invoice.dueDate,
    rateBps: invoice.rateBps,
  }));
  const bids = Array.from(lg.bids, ([bidKey, bid]) => ({
    bidKey: toHex(bidKey),
    nullifier: toHex(bid.nullifier),
    lender: toHex(bid.lender),
    commitment: toHex(bid.commitment),
  }));
  const bestBids = Array.from(lg.bestBids, ([nullifier, best]) => ({
    nullifier: toHex(nullifier),
    lender: toHex(best.lender),
    amount: best.amount,
    dueDate: best.dueDate,
    rateBps: best.rateBps,
  }));
  return {
    ledger: lg,
    invoiceCount: lg.invoiceCount,
    invoices,
    bids,
    bestBids,
  };
}

export class ShieldLedgerAPI {
  private constructor(
    public readonly deployedContract: DeployedShieldLedgerContract,
    private readonly providers: ShieldLedgerProviders,
  ) {
    this.deployedContractAddress = deployedContract.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(this.deployedContractAddress);
    this.state$ = from(
      providers.publicDataProvider.contractStateObservable(this.deployedContractAddress, { type: 'latest' }),
    ).pipe(map((contractState) => toDerivedState(contractState.data)));
  }

  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<ShieldLedgerDerivedState>;

  async registerInvoice(nullifierHex: string): Promise<void> {
    await this.deployedContract.callTx.registerInvoice(fromHex(nullifierHex));
  }

  /** Seals a bid with the wallet's lender secret; only the commitment goes on-chain. */
  async submitBid(nullifierHex: string, amount: bigint, dueDate: bigint, rateBps: bigint): Promise<void> {
    const privateState = await this.providers.privateStateProvider.get(shieldLedgerPrivateStateKey);
    const secret = privateState?.lenderSecret;
    if (!secret) throw new Error('No private state available to seal the bid.');
    const nullifier = fromHex(nullifierHex);
    const commitment = ShieldLedger.pureCircuits.deriveBidCommitment(secret, nullifier, amount, dueDate, rateBps);
    await this.deployedContract.callTx.submitBid(nullifier, commitment);
  }

  async revealBid(nullifierHex: string, amount: bigint, dueDate: bigint, rateBps: bigint): Promise<void> {
    await this.deployedContract.callTx.revealBid(fromHex(nullifierHex), amount, dueDate, rateBps);
  }

  /** Settles to the contract's chosen winner (lowest interest rate). */
  async settleInvoice(nullifierHex: string, amount: bigint, dueDate: bigint): Promise<void> {
    await this.deployedContract.callTx.settleInvoice(fromHex(nullifierHex), amount, dueDate);
  }

  static async deploy(providers: ShieldLedgerProviders): Promise<ShieldLedgerAPI> {
    const deployedContract = await deployContract(providers, {
      compiledContract: compiledShieldLedgerContract,
      privateStateId: shieldLedgerPrivateStateKey,
      initialPrivateState: createShieldLedgerPrivateState(),
    });
    return new ShieldLedgerAPI(deployedContract, providers);
  }

  static async join(
    providers: ShieldLedgerProviders,
    contractAddress: ContractAddress,
  ): Promise<ShieldLedgerAPI> {
    providers.privateStateProvider.setContractAddress(contractAddress);
    const existing = await providers.privateStateProvider.get(shieldLedgerPrivateStateKey);
    const initialPrivateState: ShieldLedgerPrivateState =
      existing ?? createShieldLedgerPrivateState();

    const deployedContract = await findDeployedContract(providers, {
      contractAddress,
      compiledContract: compiledShieldLedgerContract,
      privateStateId: shieldLedgerPrivateStateKey,
      initialPrivateState,
    });
    return new ShieldLedgerAPI(deployedContract, providers);
  }
}
