// User settings, persisted in chrome.storage.sync so they follow the user
// between machines. Loaded once before the panel mounts, then kept in sync with
// every other splice.com tab through the storage change event.
//
// There are few of them on purpose. Everything the desktop app did one way and
// the reader never changed is simply done that way: a sample goes in a folder
// named after its pack, the encoder delay is trimmed, and dragging a sample
// puts it in the library. Each of those was a switch nobody had a reason to
// turn off, and a switch nobody turns off is a setting that shouldn't exist.

/** Where a sample library goes when the reader hasn't chosen a folder. */
export const DOWNLOADS_FOLDER = "Splicedd";

export interface SpliceddSettings {
  /**
   * `wav` converts the preview to a 16-bit WAV (what DAWs and the desktop app
   * expect); `mp3` saves the decoded preview as-is, which is faster and smaller.
   */
  format: "wav" | "mp3";

  /**
   * Whether to take down the offers to subscribe that a logged-out Splice page
   * puts where its results and its buttons would be. A subscriber wants them:
   * the licence button on a row is how a sample is actually bought.
   */
  hideUpsells: boolean;

  /** Whether to stop splice.com's pages reporting what you do to analytics. */
  blockAnalytics: boolean;
}

export const DEFAULT_SETTINGS: SpliceddSettings = {
  format: "wav",
  hideUpsells: true,
  blockAnalytics: true
};

const KEY = "settings";

let current: SpliceddSettings = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();

function publish(next: SpliceddSettings) {
  current = next;
  for (const listener of listeners) {
    listener();
  }
}

/** Reads the stored settings. Must be awaited once before the panel renders. */
export async function loadSettings() {
  try {
    const stored = await chrome.storage.sync.get(KEY);
    publish({ ...DEFAULT_SETTINGS, ...(stored[KEY] as Partial<SpliceddSettings> | undefined) });
  } catch (err) {
    console.warn("[splicedd] couldn't read settings, using defaults:", err);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area != "sync" || !(KEY in changes))
      return;

    publish({ ...DEFAULT_SETTINGS, ...(changes[KEY].newValue as Partial<SpliceddSettings> | undefined) });
  });
}

/** Returns the current settings. The returned object should be treated as immutable. */
export function settings() {
  return current;
}

/** Changes select settings and persists them. */
export async function mutateSettings(patch: Partial<SpliceddSettings>) {
  const next = { ...current, ...patch };
  publish(next);

  try {
    await chrome.storage.sync.set({ [KEY]: next });
  } catch (err) {
    console.warn("[splicedd] couldn't save settings:", err);
  }
}

/**
 * Subscribes to changes. The React binding lives in the panel, so that reading
 * a setting doesn't oblige the service worker to carry React.
 */
export function onSettingsChanged(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
