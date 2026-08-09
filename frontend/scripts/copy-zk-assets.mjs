// Copies the compiled ZK artifacts (proving keys + ZKIR) from the root
// compile output into the Vite `public/` directory, where FetchZkConfigProvider
// can serve them to the browser. Run before `vite dev` and `vite build`.
//
// Layout produced (mirrors the FetchZkConfigProvider contract):
//   public/zk/keys/<circuit>.prover, .verifier
//   public/zk/zkir/<circuit>.bzkir, .zkir
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const managedDir = join(frontendDir, '..', 'contracts', 'managed', 'shield-ledger');

if (!existsSync(join(managedDir, 'keys')) || !existsSync(join(managedDir, 'zkir'))) {
  console.error(
    `Compiled ZK artifacts not found at ${managedDir}. Run \`npm run compile\` in the repo root first.`,
  );
  process.exit(1);
}

for (const sub of ['keys', 'zkir']) {
  const src = join(managedDir, sub);
  const dest = join(frontendDir, 'public', 'zk', sub);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true, force: true });
  console.log(`Copied ${sub}/ -> public/zk/${sub}/`);
}
