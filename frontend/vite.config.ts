import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { fileURLToPath } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  cacheDir: './.vite',
  build: {
    target: 'esnext',
    minify: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('onchain-runtime-v3')) return 'wasm';
        },
      },
    },
    commonjsOptions: {
      transformMixedEsModules: true,
      extensions: ['.js', '.cjs'],
      ignoreDynamicRequires: true,
    },
  },
  plugins: [
    react(),
    wasm(),
    topLevelAwait({
      promiseExportName: '__tla',
      promiseImportName: (i) => `__tla_${i}`,
    }),
    {
      name: 'wasm-module-resolver',
      resolveId(source, importer) {
        if (
          source === '@midnight-ntwrk/onchain-runtime-v3' &&
          importer &&
          importer.includes('@midnight-ntwrk/compact-runtime')
        ) {
          return {
            id: source,
            external: false,
            moduleSideEffects: true,
          };
        }
        return null;
      },
    },
  ],
  optimizeDeps: {
    include: ['@midnight-ntwrk/compact-runtime'],
    exclude: [
      '@midnight-ntwrk/onchain-runtime-v3',
      '@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm_bg.wasm',
      '@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm.js',
    ],
  },
  resolve: {
    alias: {
      // The compiled contract lives in the repo root, so bare imports from it
      // (compact-runtime / compact-js) resolve to the ROOT tree's copies —
      // while midnight-js-protocol uses the FRONTEND tree's copies. Two
      // physical instances of compact-js mean two `Symbol()` contract-context
      // registries, so createContract() reads `compiledContract[Symbol]` as
      // undefined ("Cannot read properties of undefined (reading 'ctor')").
      // Alias both to the frontend copies so everything shares one instance.
      '@midnight-ntwrk/compact-js': fileURLToPath(
        new URL('./node_modules/@midnight-ntwrk/compact-js', import.meta.url),
      ),
      '@midnight-ntwrk/compact-runtime': fileURLToPath(
        new URL('./node_modules/@midnight-ntwrk/compact-runtime', import.meta.url),
      ),
      // `isomorphic-ws` exposes no statically-resolvable named `WebSocket`
      // export from its browser build; the indexer provider needs it.
      'isomorphic-ws': fileURLToPath(new URL('./src/shims/isomorphic-ws.ts', import.meta.url)),
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.wasm'],
    mainFields: ['browser', 'module', 'main'],
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      // Optional local-devnet relay: set VITE_INDEXER_URL /
      // VITE_PROOF_SERVER_URL to these paths if the wallet's own URLs are
      // blocked by CORS. Public network URLs (preview/preprod) work directly.
      '/indexer': {
        target: 'http://localhost:8088',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/indexer/, ''),
      },
      '/proof-server': {
        target: 'http://localhost:6300',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proof-server/, ''),
      },
    },
  },
});
