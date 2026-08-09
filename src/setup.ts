// Orchestrator for `npm run setup`. Replaces the prior package.json chain
// `docker compose up -d --wait && npm run compile && npm run deploy` so
// we can branch on --network and forward it to deploy.
import { spawnSync } from 'node:child_process';
import { resolveNetwork, setActiveNetwork, parseNetworkFlag } from './network';

function fail(cmd: string, args: string[], r: { error?: Error }): void {
  process.stderr.write(`\nCommand failed: ${cmd} ${args.join(' ')}\n`);
  if (r.error) process.stderr.write(`${r.error.message}\n`);
  process.exit(1);
}

// `npm` is npm.cmd on Windows, which cannot be spawned directly with
// shell:false (EINVAL), so route it through cmd.exe there.
function runNpm(args: string[]): void {
  if (process.platform === 'win32') {
    const r = spawnSync('cmd.exe', ['/d', '/s', '/c', `npm ${args.join(' ')}`], { stdio: 'inherit' });
    if (r.status !== 0) fail('npm', args, r);
    return;
  }
  const r = spawnSync('npm', args, { stdio: 'inherit' });
  if (r.status !== 0) fail('npm', args, r);
}

function run(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) fail(cmd, args, r);
}

async function main(): Promise<void> {
  const argv = process.argv;
  const flag = parseNetworkFlag(argv);
  if (flag) setActiveNetwork(flag);
  const { network, config } = resolveNetwork({ argv });

  process.stdout.write(`\n→ Setting up ShieldLedger on network: ${network}\n\n`);

  // 1. Bring up only the services this network needs.
  run('docker', ['compose', 'up', '-d', '--wait', ...config.composeServices]);

  // 2. Compile the contract (network-agnostic).
  runNpm(['run', 'compile']);

  // 3. Deploy. Forward --network so deploy.ts sees the same network.
  const deployArgs = network === 'undeployed' ? [] : ['--', '--network', network];
  runNpm(['run', 'deploy', ...deployArgs]);
}

main().catch((e) => {
  process.stderr.write(`\nSetup failed: ${(e as Error).message}\n`);
  process.exit(1);
});
