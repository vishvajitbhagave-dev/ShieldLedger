/**
 * CLI for interacting with the ShieldLedger contract: register invoices as an
 * SME, submit financing bids as a lender, settle the winning bid, and inspect
 * the public ledger.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { WebSocket } from 'ws';

// Midnight SDK imports
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';

import { resolveNetwork, getOrCreateWallet, formatWalletBackupNotice, getDeployment } from './network';
import { createWallet, persistWalletState, unshieldedToken, type WalletContext } from './wallet';
import { loadOrCreatePrivateState } from './private-state';
import { compiledShieldLedgerContract } from './compiled';

// Enable WebSocket for GraphQL subscriptions
// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

const PRIVATE_STATE_ID = 'shieldLedgerPrivateState';

const { network, config: networkConfig } = resolveNetwork();
const WALLET = getOrCreateWallet(network);
const SEED = WALLET.seed;
{
  const notice = formatWalletBackupNotice(WALLET, network);
  if (notice) console.log(notice);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zkConfigPath = path.resolve(__dirname, '..', 'contracts', 'managed', 'shield-ledger');

// ─── Hex helpers ───────────────────────────────────────────────────────────────

function parseHex(input: string): Uint8Array {
  const hex = input.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error('Expected exactly 64 hex characters (32 bytes).');
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Providers ─────────────────────────────────────────────────────────────────

async function createProviders(walletCtx: WalletContext) {
  const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD?.trim() || 'Local-Devnet-Development-Placeholder-1';

  const walletProvider = {
    getCoinPublicKey: () => walletCtx.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => walletCtx.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return walletCtx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx) as any,
  };

  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  const accountId = walletCtx.unshieldedKeystore.getBech32Address().toString();

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'shield-ledger-state',
      accountId,
      privateStoragePasswordProvider: () => privateStatePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

// ─── Main CLI ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                   ShieldLedger CLI                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const rl = createInterface({ input: stdin, output: stdout });

  const deployment = getDeployment(network);
  if (!deployment) {
    console.error(`No deploy on file for network ${network}. Run \`npm run setup -- --network ${network}\` first.`);
    process.exit(1);
  }
  console.log(`  Contract: ${deployment.address}`);
  console.log(`  Network: ${network}\n`);

  try {
    console.log('  Connecting to wallet...');
    const walletCtx = await createWallet({ network, networkConfig, seed: SEED });
    const restoredCount = Object.values(walletCtx.restored).filter(Boolean).length;
    if (restoredCount > 0) {
      console.log(`  Restored ${restoredCount}/3 child wallets from .midnight-wallet-state — sync will resume from saved point.`);
    }

    console.log('  Syncing with network...');
    console.log('  ℹ  This may take several minutes depending on network size.\n');
    const syncStart = Date.now();
    const syncInterval = setInterval(() => {
      const elapsed = Math.round((Date.now() - syncStart) / 1000);
      process.stdout.write(`\r  ⏳ Still syncing... (${elapsed}s elapsed)   `);
    }, 5000);
    const state = await walletCtx.wallet.waitForSyncedState();
    clearInterval(syncInterval);
    process.stdout.write('\r  ✓ Synced with network.                                      \n');

    await persistWalletState(network, walletCtx);
    const balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
    console.log(`  Balance: ${balance.toLocaleString()} tNight\n`);

    if (balance === 0n && network !== 'undeployed' && networkConfig.faucet) {
      const address = walletCtx.unshieldedKeystore.getBech32Address();
      console.log('  ⚠ Wallet has no tNight. Fund it from the faucet to send transactions:');
      console.log(`     ${networkConfig.faucet}`);
      console.log(`     Wallet address: ${address}\n`);
    }

    console.log('  Connecting to contract...');
    const providers = await createProviders(walletCtx);
    const initialPrivateState = loadOrCreatePrivateState(network);

    const deployed: any = await findDeployedContract(providers, {
      compiledContract: compiledShieldLedgerContract as any,
      contractAddress: deployment.address,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState,
    });

    console.log('  ✅ Connected!\n');

    const readLedger = async () => {
      const contractState = await providers.publicDataProvider.queryContractState(deployment.address);
      if (!contractState) return console.log('  (contract state empty)');
      const { ledger } = await import('../contracts/managed/shield-ledger/contract/index.js');
      const lg = ledger(contractState.data);
      const rows: string[] = [];
      for (const [nullifier, invoice] of lg.invoices) {
        rows.push(`    nullifier=${toHex(nullifier)}  lender=${invoice.lender.is_some ? toHex(invoice.lender.value) : '(none)'}  amount=${invoice.amount}  due=${invoice.dueDate}  commitment=${toHex(invoice.smeCommitment)}`);
        for (const [bidKey, bid] of lg.bids) {
          if (bid.nullifier.length !== nullifier.length || !bid.nullifier.every((v, i) => v === nullifier[i])) continue;
          rows.push(`        bid ${toHex(bidKey).slice(0, 16)}…  by ${toHex(bid.lender).slice(0, 16)}…  amount=${bid.amount}  due=${bid.dueDate}`);
        }
      }
      console.log(`\n  📋 Ledger — invoiceCount=${lg.invoiceCount}, invoices=${lg.invoices.size()}, bids=${lg.bids.size()}\n${rows.join('\n')}\n`);
    };

    const sendAndShow = async (label: string, txPromise: Promise<any>) => {
      console.log(`\n  Submitting ${label} (this may take 30-60 seconds)...`);
      const tx = await txPromise;
      console.log(`  ✅ ${label} succeeded`);
      console.log(`  Transaction ID: ${tx.public.txId}`);
      console.log(`  Block height: ${tx.public.blockHeight}\n`);
    };

    let running = true;
    while (running) {
      console.log('─── Menu ───────────────────────────────────────────────────────');
      console.log('  1. Register invoice (SME)');
      console.log('  2. Submit bid (Lender)');
      console.log('  3. Settle invoice (SME)');
      console.log('  4. View ledger');
      console.log('  5. Check wallet balance');
      console.log('  6. Exit\n');

      const choice = await rl.question('  Your choice: ');

      try {
        switch (choice.trim()) {
          case '1': {
            const nullifier = await rl.question('  Invoice nullifier (64 hex chars): ');
            await sendAndShow('registerInvoice', deployed.callTx.registerInvoice(parseHex(nullifier)));
            break;
          }

          case '2': {
            const nullifier = await rl.question('  Invoice nullifier (64 hex chars): ');
            const amountRaw = await rl.question('  Bid amount: ');
            const dueRaw = await rl.question('  Bid due date (unix seconds): ');
            await sendAndShow('submitBid', deployed.callTx.submitBid(parseHex(nullifier), BigInt(amountRaw.trim()), BigInt(dueRaw.trim())));
            break;
          }

          case '3': {
            const nullifier = await rl.question('  Invoice nullifier (64 hex chars): ');
            const lender = await rl.question('  Winning lender pseudonym (64 hex chars): ');
            const amountRaw = await rl.question('  Financed amount: ');
            const dueRaw = await rl.question('  Financed due date (unix seconds): ');
            await sendAndShow('settleInvoice', deployed.callTx.settleInvoice(parseHex(nullifier), parseHex(lender), BigInt(amountRaw.trim()), BigInt(dueRaw.trim())));
            break;
          }

          case '4':
            console.log('\n  Reading ledger from indexer...');
            await readLedger();
            break;

          case '5': {
            console.log('\n  Checking balance...');
            const currentState = await walletCtx.wallet.waitForSyncedState();
            const currentBalance = currentState.unshielded.balances[unshieldedToken().raw] ?? 0n;
            const dustBalance = currentState.dust.balance(new Date());
            console.log(`\n  tNight: ${currentBalance.toLocaleString()}`);
            console.log(`  DUST: ${dustBalance.toLocaleString()}\n`);
            break;
          }

          case '6':
            running = false;
            console.log('\n  👋 Goodbye!\n');
            break;

          default:
            console.log('\n  ❌ Invalid choice. Please enter 1-6.\n');
        }
      } catch (error) {
        console.error('\n  ❌ Failed:', error instanceof Error ? error.message : error);
      }
    }

    await persistWalletState(network, walletCtx);
    await walletCtx.wallet.stop();
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
  } finally {
    rl.close();
  }
}

main().catch(console.error);
