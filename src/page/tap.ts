// Runs inside splice.com's own JavaScript world, ahead of Splice's bundle, and
// reports back what the page asks the network for.
//
// Watching Splice's own traffic beats repeating its requests: the pre-signed
// preview URLs arrive for free, what Splicedd knows about is exactly what the
// user is looking at, and browsing costs no extra request at all.
//
// The page is left as it was. `fetch` is wrapped so that it forwards a copy of
// the response and returns the original untouched -- nothing is blocked,
// delayed, or rewritten, and a failure in here can't fail the page's request.

import { TAP_SOURCE, TapEnvelope, TapMessage } from "./protocol";

/** Splice's GraphQL endpoint, whichever subdomain is serving it. */
const GRAPHQL_PATH = "/graphql";

/** Preview files. Scrambled, so they must pass through the page's own JavaScript. */
const AUDIO_SUFFIX = ".mp3";

/** A search response is tens of kilobytes; anything much larger isn't one. */
const MAX_BODY_LENGTH = 8_000_000;

/** Marks the page as already tapped, so a second injection can't double up. */
const INSTALLED = "__spliceddTap";

const page = window as Window & { [INSTALLED]?: true };

if (page[INSTALLED] != true) {
  page[INSTALLED] = true;
  install();
}

function install() {
  const pageFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    const response = pageFetch(input, init);

    try {
      observe(urlOf(input), response);
    } catch {
      // Never let watching a request get in the way of making one.
    }

    return response;
  };
}

function observe(url: string | null, response: Promise<Response>) {
  const path = url == null ? null : pathOf(url);

  if (url == null || path == null) {
    return;
  }

  if (path.endsWith(AUDIO_SUFFIX)) {
    report({ kind: "audio", url });
  } else if (path.endsWith(GRAPHQL_PATH)) {
    forwardBody(response);
  }
}

/**
 * Sends on a response body without disturbing the page's own read of it.
 *
 * The clone is taken in the first continuation after the response arrives,
 * which -- because this handler was attached before the page's -- still runs
 * while the body is unread, the only point at which a response can be cloned.
 */
function forwardBody(response: Promise<Response>) {
  void response
    .then(result => result.clone().text())
    .then(body => {
      if (body.length <= MAX_BODY_LENGTH) {
        report({ kind: "graphql", body });
      }
    })
    .catch(() => {});
}

function report(message: TapMessage) {
  const envelope: TapEnvelope = { ...message, source: TAP_SOURCE };

  // Addressed to this page only: no frame, opener or embedder should see it.
  window.postMessage(envelope, window.location.origin);
}

function urlOf(input: RequestInfo | URL): string | null {
  if (typeof input == "string") return input;
  if (input instanceof URL) return input.href;

  return input?.url ?? null;
}

function pathOf(url: string): string | null {
  try {
    return new URL(url, document.baseURI).pathname;
  } catch {
    return null;
  }
}
