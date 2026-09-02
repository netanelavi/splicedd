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
const SETTINGS_MENU_ID = "splicedd-settings";

// --- the toolbar button, the keyboard shortcut and the context menu ---

chrome.runtime.onInstalled.addListener(() => {
  // Cleared first: an update that finds its own items already there would
  // fail to create them and leave the menu half-made.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: SEARCH_MENU_ID,
      title: 'Find "%s" on Splice',
      contexts: ["selection"],
      documentUrlPatterns: SPLICE_TAB_URLS
    });

    // On the toolbar icon itself, so the settings are reachable from the
    // extension rather than only from inside a panel that has to be opened first.
    chrome.contextMenus.create({
      id: SETTINGS_MENU_ID,
      title: "Splicedd settings",
      contexts: ["action"]
    });
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
  if (info.menuItemId == SETTINGS_MENU_ID) {
    void commandPanel(tab, { kind: "settings" });
  }

  // A selection is searched for the way anything is on Splice: by going to
  // the search. The page's own rows then carry Splicedd's buttons.
  if (info.menuItemId == SEARCH_MENU_ID && info.selectionText != null) {
    const url = `${SPLICE_SOUNDS_URL}?filepath=${encodeURIComponent(info.selectionText.trim())}`;

    void (isSpliceTab(tab) ? chrome.tabs.update(tab.id, { url }) : chrome.tabs.create({ url }));
  }
});

function isSpliceTab(tab: chrome.tabs.Tab | undefined): tab is chrome.tabs.Tab & { id: number } {
  return tab?.id != null && /^https:\/\/(www\.)?splice\.com\//.test(tab.url ?? "");
}

/** Commands waiting on a splice.com tab that is still loading. */
const pending = new Map<number, PanelCommand>();

chrome.tabs.onUpdated.addListener((tabId, info) => {
  const command = pending.get(tabId);

  if (command == null || info.status != "complete") {
    return;
  }

  pending.delete(tabId);
  void deliver(tabId, command);
});

/**
 * Delivers a command to the panel in the given tab, opening splice.com first if
 * the user isn't there yet -- and remembering the command until that tab has
 * loaded, so asking for the settings from a page that isn't Splice's still ends
 * up on the settings.
 */
async function commandPanel(tab: chrome.tabs.Tab | undefined, command: PanelCommand) {
  if (!isSpliceTab(tab)) {
    const opened = await chrome.tabs.create({ url: SPLICE_SOUNDS_URL });

    if (opened.id != null) {
      pending.set(opened.id, command);
    }

    return;
  }

  await deliver(tab.id, command);
}

/** How long, and how often, to keep offering a command to a page still starting. */
const DELIVERY_ATTEMPTS = 30;
const DELIVERY_INTERVAL = 100;

async function deliver(tabId: number, command: PanelCommand) {
  try {
    await chrome.tabs.sendMessage(tabId, command);
    return;
  } catch {
    // The tab predates the extension being installed or updated, so it has no
    // content scripts yet. Injecting them brings it up to date without a
    // reload; the tap picks up from the next request the page makes.
    const target = { tabId };

    await chrome.scripting.executeScript({ target, files: ["tap.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target, files: ["content.js"] });
  }

  // The page listens once it has read its settings, a moment after the script
  // runs; a command sent before that would be a click that did nothing.
  for (let attempt = 1; ; attempt++) {
    try {
      await chrome.tabs.sendMessage(tabId, command);
      return;
    } catch (err) {
      if (attempt == DELIVERY_ATTEMPTS) {
        throw err;
      }

      await new Promise(resolve => setTimeout(resolve, DELIVERY_INTERVAL));
    }
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
    .catch(async err => {
      // Two saves raced to create it and the other won, which is fine.
      if (!await chrome.offscreen.hasDocument()) {
        throw err;
      }
    })
    .finally(() => { creatingOffscreen = null; });

  await creatingOffscreen;
}
