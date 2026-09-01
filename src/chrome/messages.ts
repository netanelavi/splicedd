// The message protocol between the panel injected into splice.com, the
// background service worker, and the offscreen document.
//
// Everything crossing these boundaries is JSON, so binary payloads travel as
// base64 (see base64.ts).

/** A request the injected panel sends to the background service worker. */
export type WorkerRequest =
  | { kind: "fetch-binary"; url: string }
  | { kind: "graphql"; body: string }
  | { kind: "save-file"; base64: string; mime: string; filename: string; saveAs: boolean }
  | { kind: "reveal-download"; downloadId: number };

/** What each {@link WorkerRequest} resolves to. */
export interface WorkerReply {
  "fetch-binary": { base64: string };
  "graphql": { body: string };
  "save-file": SavedFile;
  "reveal-download": Record<string, never>;
}

export interface SavedFile {
  downloadId: number;

  /** The path the file was saved under, relative to the download folder. */
  filename: string;

  /** Whether an earlier download had already put this file on disk. */
  existed: boolean;
}

/** A command the service worker pushes to the panel in a splice.com tab. */
export type PanelCommand =
  | { kind: "toggle-panel" }
  | { kind: "search"; query: string };

/**
 * A job the service worker hands to the offscreen document. Offscreen documents
 * can only reach `chrome.runtime`, so their whole role is minting the blob URLs
 * a service worker can't make for itself.
 */
export type OffscreenJob =
  | { kind: "create-blob-url"; base64: string; mime: string }
  | { kind: "revoke-blob-url"; url: string };

/** How a job travels: one runtime channel serves both the worker and the document. */
export type OffscreenRequest = OffscreenJob & { target: "offscreen" };

export interface OffscreenReply {
  "create-blob-url": { url: string };
  "revoke-blob-url": Record<string, never>;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Sends a request over the runtime channel, resolving with its payload or
 * throwing with the error the other side reported.
 */
export async function sendRequest<T>(message: unknown, recipient: string): Promise<T> {
  let reply: Result<T> | undefined;

  try {
    reply = await chrome.runtime.sendMessage(message);
  } catch (err) {
    // Most often "Extension context invalidated": the extension was reloaded
    // while this splice.com tab stayed open.
    throw new Error(`couldn't reach the Splicedd ${recipient} (${errorMessage(err)})`);
  }

  if (reply == null) {
    throw new Error(`the Splicedd ${recipient} didn't answer`);
  }

  if (!reply.ok) {
    throw new Error(reply.error);
  }

  return reply.value;
}

/** Asks the background service worker for something only it can do. */
export function callWorker<K extends WorkerRequest["kind"]>(
  request: Extract<WorkerRequest, { kind: K }>
): Promise<WorkerReply[K]> {
  return sendRequest(request, "background worker");
}

/**
 * Answers a `chrome.runtime.onMessage` event from an async handler. Returning
 * `true` is what keeps the response channel open until the promise settles.
 */
export function respondAsync<T>(
  sendResponse: (resp: Result<T>) => void,
  handler: () => Promise<T>
): true {
  handler().then(
    value => sendResponse({ ok: true, value }),
    err => sendResponse({ ok: false, error: errorMessage(err) })
  );

  return true;
}
