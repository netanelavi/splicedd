// Network access from the injected panel.
//
// The panel runs inside splice.com, so its own `fetch` is same-site: it carries
// the user's session, clears Cloudflare's bot check, and satisfies Splice's CORS
// policy — the exact problem the desktop app spawns a hidden webview to solve.
// Splice's asset CDNs don't always allow the splice.com origin though, so any
// request the page can't make is retried through the background worker, whose
// host permissions exempt it from CORS.

import { base64ToBytes, bytesToBase64 } from "./base64";
import { callWorker } from "./messages";
import { Bytes } from "../bytes";

/** Origins that rejected a page-context request, and so go straight to the worker. */
const corsBlocked = new Set<string>();

function originOf(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

/** Fetches a URL as raw bytes, falling back to the background worker on CORS failures. */
export async function fetchBytes(url: string): Promise<Bytes> {
  const origin = originOf(url);

  if (!corsBlocked.has(origin)) {
    try {
      const resp = await fetch(url, { credentials: "omit" });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      return new Uint8Array(await resp.arrayBuffer());
    } catch {
      // A cross-origin rejection isn't distinguishable from a network error
      // here, so treat both as "this origin needs the worker" — the worker
      // reports a real failure with a usable message anyway.
      corsBlocked.add(origin);
    }
  }

  const { base64 } = await callWorker({ kind: "fetch-binary", url });
  return base64ToBytes(base64);
}

export async function fetchJson<T>(url: string): Promise<T> {
  const bytes = await fetchBytes(url);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

/**
 * Runs a GraphQL request against Splice. Issued from the page so it looks like
 * any other request the Splice web app makes; if that fails (an unusual page
 * CSP, say), the worker retries it.
 */
export async function spliceGraphQL(endpoint: string, body: string): Promise<string> {
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      credentials: "include"
    });

    if (!resp.ok) {
      throw new Error(`Splice returned HTTP ${resp.status}`);
    }

    return await resp.text();
  } catch (pageErr) {
    try {
      const { body: relayed } = await callWorker({ kind: "graphql", body });
      return relayed;
    } catch {
      throw pageErr;
    }
  }
}

/** Uploads bytes to the worker, which saves them to the user's download folder. */
export async function saveFile(
  bytes: Uint8Array, mime: string, filename: string, saveAs = false
) {
  return await callWorker({
    kind: "save-file",
    base64: bytesToBase64(bytes),
    mime,
    filename,
    saveAs
  });
}
