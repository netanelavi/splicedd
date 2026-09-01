/**
 * A byte array backed by a plain `ArrayBuffer`. TypeScript tells these apart
 * from views over a `SharedArrayBuffer`, and the Blob, fetch and Web Audio APIs
 * only accept the plain kind.
 */
export type Bytes = Uint8Array<ArrayBuffer>;
