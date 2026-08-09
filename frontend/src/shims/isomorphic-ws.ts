// Vite alias target for `isomorphic-ws`. The indexer public-data provider
// imports `{ WebSocket }` from `isomorphic-ws`, whose CJS browser build does
// not expose a named export that Rollup can statically resolve. In a browser
// we can simply hand out the native global WebSocket.
const NativeWebSocket = globalThis.WebSocket;

export { NativeWebSocket as WebSocket };
export default NativeWebSocket;
