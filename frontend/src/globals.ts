import { Buffer } from 'buffer';

// Map Vite's mode onto `process.env.NODE_ENV` for third-party libraries
// (rxjs, the wallet SDK, etc.) that expect it, and polyfill `Buffer`, which
// several of the Midnight runtime modules use.
//
// @ts-expect-error - support third-party libraries that require `NODE_ENV`.
globalThis.process = {
  env: {
    NODE_ENV: import.meta.env.MODE,
  },
};

globalThis.Buffer = Buffer;
