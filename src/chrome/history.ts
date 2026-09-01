// What Splicedd has saved, newest first.
//
// Kept in `chrome.storage.local` rather than `sync`: it grows, and a list of
// files that exist on this machine means nothing on another one -- the folder
// they are in is per-machine too.

const KEY = "history";

/** How many saves to remember. Beyond this the oldest are forgotten. */
const LIMIT = 500;

export interface HistoryEntry {
  /** Splice's id for the sample, so the same one saved twice is one entry. */
  uuid: string;

  /** The file's own name, e.g. `CJD_140_drum_loop.wav`. */
  name: string;

  /** Where it sits inside the library, e.g. `Concrete_Jungle_Drums/CJD_140.wav`. */
  path: string;

  pack: string | null;
  cover: string | null;

  savedAt: number;
}

/** Records a save, moving a sample already listed back to the top. */
export async function remember(entry: Omit<HistoryEntry, "savedAt">) {
  const kept = (await history()).filter(x => x.uuid != entry.uuid);
  await write([{ ...entry, savedAt: Date.now() }, ...kept].slice(0, LIMIT));
}

export async function history(): Promise<HistoryEntry[]> {
  try {
    const stored = await chrome.storage.local.get(KEY);
    return (stored[KEY] as HistoryEntry[] | undefined) ?? [];
  } catch {
    return [];
  }
}

export async function forget(uuid: string) {
  await write((await history()).filter(x => x.uuid != uuid));
}

export async function forgetAll() {
  await write([]);
}

/** Calls back whenever the list changes, in this tab or any other. */
export function onHistoryChanged(listener: () => void) {
  const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area == "local" && KEY in changes) {
      listener();
    }
  };

  chrome.storage.onChanged.addListener(onChanged);
  return () => chrome.storage.onChanged.removeListener(onChanged);
}

async function write(entries: HistoryEntry[]) {
  try {
    await chrome.storage.local.set({ [KEY]: entries });
  } catch (err) {
    console.warn("[splicedd] couldn't record what was saved:", err);
  }
}
