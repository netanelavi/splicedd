// User settings, persisted in chrome.storage.sync so they follow the user
// between machines. Loaded once before the panel mounts, then kept in sync with
// every other splice.com tab through the storage change event.

import { useSyncExternalStore } from "react";

export interface SpliceddSettings {
  /** Folder under the browser's download directory samples are saved to. */
  downloadDir: string;

  /** Whether to nest downloads in a per-pack folder, like the desktop app does. */
  organizeByPack: boolean;

  /**
   * `wav` converts the preview to a 16-bit WAV (what DAWs and the desktop app
   * expect); `mp3` saves the decoded preview as-is, which is faster and smaller.
   */
  format: "wav" | "mp3";

  /** Trims the silent samples MP3 encoders prepend, so loops start on the beat. */
  trimEncoderDelay: boolean;

  /** Whether dragging a sample also saves it to the download folder. */
  saveOnDrag: boolean;

  theme: "dark" | "light";

  /** Width of the docked panel, in pixels. */
  panelWidth: number;

  /** Results per search page (Splice's own limit). */
  resultsPerPage: number;

  /** Whether the panel opens by itself when a splice.com page loads. */
  openOnLoad: boolean;
}

export const DEFAULT_SETTINGS: SpliceddSettings = {
  downloadDir: "Splicedd",
  organizeByPack: true,
  format: "wav",
  trimEncoderDelay: true,
  saveOnDrag: true,
  theme: "dark",
  panelWidth: 560,
  resultsPerPage: 50,
  openOnLoad: false
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

/** Subscribes a component to the settings object. */
export function useSettings() {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    settings
  );
}
