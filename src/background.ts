// The background service worker.
//
// It owns everything the injected panel isn't allowed to do itself: requests to
// hosts that don't allow the splice.com origin (its host permissions exempt it
// from CORS), saving files through the downloads API, the toolbar button, the
// keyboard shortcut and the context menu.

import { bytesToBase64 } from "./chrome/base64";
import {
  OffscreenJob, OffscreenReply, OffscreenRequest, PanelCommand, SavedFile,
  WorkerRequest, WorkerReply, respondAsync, sendRequest
} from "./chrome/messages";
import { loadSettings, onSettingsChanged, settings } from "./chrome/settings";
import { GRAPHQL_URL } from "./splice/api";

const SPLICE_TAB_URLS = ["https://splice.com/*", "https://www.splice.com/*"];
const SPLICE_SOUNDS_URL = "https://splice.com/sounds/search/samples";
const SEARCH_MENU_ID = "splicedd-search-selection";

// --- the toolbar button, the keyboard shortcut and the context menu ---

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: SEARCH_MENU_ID,
    title: 'Find "%s" with Splicedd',
    contexts: ["selection"],
    documentUrlPatterns: SPLICE_TAB_URLS
  });
});

chrome.action.onClicked.addListener(tab => {
  void commandPanel(tab, { kind: "toggle-panel" });
});

// --- keeping splice.com's analytics off ---
//
// A blocking ruleset rather than anything in the page: it covers a beacon sent
// on unload and a tracking pixel just as well as a `fetch`, and it works before
// any of Splice's own code runs. The rules are scoped to requests splice.com
// starts, so nothing else the reader browses is touched.

const ANALYTICS_RULES = "analytics";

async function applyAnalyticsSetting() {
  const enabled = settings().blockAnalytics;

  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets(enabled
      ? { enableRulesetIds: [ANALYTICS_RULES] }
      : { disableRulesetIds: [ANALYTICS_RULES] });
  } catch (err) {
    console.warn("[splicedd] couldn't apply the analytics setting:", err);
  }
}

// A service worker is woken and discarded constantly, so the setting is read
// and applied on each start rather than only when it changes.
void loadSettings().then(() => {
  onSettingsChanged(() => void applyAnalyticsSetting());
  return applyAnalyticsSetting();
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command == "toggle-panel") {
    void commandPanel(tab, { kind: "toggle-panel" });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId == SEARCH_MENU_ID && info.selectionText != null) {
    void commandPanel(tab, { kind: "search", query: info.selectionText.trim() });
  }
});

function isSpliceTab(tab: chrome.tabs.Tab | undefined): tab is chrome.tabs.Tab & { id: number } {
  return tab?.id != null && /^https:\/\/(www\.)?splice\.com\//.test(tab.url ?? "");
}

/**
 * Delivers a command to the panel in the given tab, opening splice.com first if
 * the user isn't there yet.
 */
async function commandPanel(tab: chrome.tabs.Tab | undefined, command: PanelCommand) {
  if (!isSpliceTab(tab)) {
    await chrome.tabs.create({ url: SPLICE_SOUNDS_URL });
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, command);
  } catch {
    // The tab predates the extension being installed or updated, so it has no
    // content scripts yet. Injecting them brings it up to date without a
    // reload; the tap picks up from the next request the page makes.
    const target = { tabId: tab.id };

    await chrome.scripting.executeScript({ target, files: ["tap.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target, files: ["content.js"] });
    await chrome.tabs.sendMessage(tab.id, command);
  }
}

// --- requests from the panel ---

chrome.runtime.onMessage.addListener((message: WorkerRequest | OffscreenRequest, _sender, sendResponse) => {
  if ("target" in message) {
    return false; // meant for the offscreen document
  }

  switch (message.kind) {
    case "fetch-binary":
      return respondAsync(sendResponse, () => fetchBinary(message.url));
    case "graphql":
      return respondAsync(sendResponse, () => runGraphQL(message.body));
    case "save-file":
      return respondAsync(sendResponse, () => saveFile(message));
    case "reveal-download":
      return respondAsync(sendResponse, async () => {
        chrome.downloads.show(message.downloadId);
        return {};
      });
  }

  return false;
});

async function fetchBinary(url: string): Promise<WorkerReply["fetch-binary"]> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`${new URL(url).host} returned HTTP ${resp.status}`);
  }

  return { base64: bytesToBase64(new Uint8Array(await resp.arrayBuffer())) };
}

async function runGraphQL(body: string): Promise<WorkerReply["graphql"]> {
  const resp = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body
  });

  if (!resp.ok) {
    throw new Error(`Splice returned HTTP ${resp.status}`);
  }

  return { body: await resp.text() };
}

// --- saving samples ---

async function saveFile(
  req: Extract<WorkerRequest, { kind: "save-file" }>
): Promise<SavedFile> {
  const existing = await findDownload(req.filename);
  if (existing != null && !req.saveAs) {
    return { downloadId: existing.id, filename: req.filename, existed: true };
  }

  const { url } = await callOffscreen({ kind: "create-blob-url", base64: req.base64, mime: req.mime });

  try {
    const downloadId = await chrome.downloads.download({
      url,
      filename: req.filename,
      conflictAction: "uniquify",
      saveAs: req.saveAs
    });

    revokeWhenFinished(downloadId, url);
    return { downloadId, filename: req.filename, existed: false };
  } catch (err) {
    await callOffscreen({ kind: "revoke-blob-url", url });
    throw err;
  }
}

/** Finds a still-present download previously saved under the given relative path. */
async function findDownload(filename: string) {
  const basename = filename.split("/").pop()!;

  // `exists` is refreshed lazily by Chrome, so it's filtered rather than queried.
  const matches = await chrome.downloads.search({ query: [basename], state: "complete", limit: 0 });

  return matches.find(x => x.exists != false && x.filename.replace(/\\/g, "/").endsWith(`/${filename}`));
}

/** Keeps a sample's blob alive until Chrome has finished writing it out. */
function revokeWhenFinished(downloadId: number, url: string) {
  const listener = (delta: chrome.downloads.DownloadDelta) => {
    if (delta.id != downloadId || delta.state == null || delta.state.current == "in_progress")
      return;

    chrome.downloads.onChanged.removeListener(listener);
    void callOffscreen({ kind: "revoke-blob-url", url });
  };

  chrome.downloads.onChanged.addListener(listener);
}

async function callOffscreen<K extends OffscreenJob["kind"]>(
  job: Extract<OffscreenJob, { kind: K }>
): Promise<OffscreenReply[K]> {
  await ensureOffscreenDocument();

  const request: OffscreenRequest = { ...job, target: "offscreen" };
  return sendRequest(request, "blob worker");
}

let creatingOffscreen: Promise<void> | null = null;

async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) {
    return;
  }

  creatingOffscreen ??= chrome.offscreen
    .createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification: "Turns a decoded sample into a blob URL the downloads API can save to disk."
    })
    .finally(() => { creatingOffscreen = null; });

  await creatingOffscreen;
}
