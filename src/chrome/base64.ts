// Binary payloads cross extension message boundaries as base64 — runtime
// messages are JSON, and a byte-per-array-element encoding would be roughly
// six times larger than the base64 form.

import { Bytes } from "../bytes";

/** The chunk size used when converting bytes to base64, in bytes. Keeps the argument list of `String.fromCharCode` well within the engine's limit. */
const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }

  return btoa(binary);
}

export function base64ToBytes(base64: string): Bytes {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}
