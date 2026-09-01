// Saving samples into a folder the user picked.
//
// `chrome.downloads` can only ever write inside the browser's own download
// directory, and it decides the final name itself -- it will rename around a
// conflict, and it falls back to naming a file after its URL, which for a blob
// is a bare id. Neither is what a sample library wants.
//
// The File System Access API doesn't have either problem: the reader points at
// a folder once, the handle is kept, and from then on Splicedd writes the file
// where it says with the name it says. The browser's download folder stays as
// the fallback for when no folder has been chosen.

import { Bytes } from "../bytes";

/** Just enough of the File System Access API to write a file into a folder. */
type PermissionState = "granted" | "denied" | "prompt";

interface HandlePermission {
  /** Absent on a handle that needs no permission of its own. */
  queryPermission?(descriptor: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: "readwrite" }): Promise<PermissionState>;
}

interface DirectoryHandle extends HandlePermission {
  readonly name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
}

interface FileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<WritableStream & { write(data: BufferSource): Promise<void> }>;
}

interface Picker {
  showDirectoryPicker?(options: {
    mode: "readwrite";
    id?: string;
    startIn?: string;
  }): Promise<DirectoryHandle>;
}

const DATABASE = "splicedd";
const STORE = "handles";
const KEY = "download-folder";

const picker = window as unknown as Picker;

/** Whether this browser can be pointed at a folder at all. */
export function canChooseFolder() {
  return typeof picker.showDirectoryPicker == "function";
}

/**
 * Asks the reader for a folder and remembers it. Must be called from a click:
 * the browser only opens the picker for something the reader did.
 */
export async function chooseFolder(): Promise<string | null> {
  if (picker.showDirectoryPicker == null) {
    return null;
  }

  // `id` gives the picker its own remembered starting point, rather than the
  // one every other picker on the page shares.
  const handle = await picker.showDirectoryPicker({ mode: "readwrite", id: "splicedd", startIn: "music" });

  await put(handle);
  return handle.name;
}

/** The name of the chosen folder, for showing the reader what they picked. */
export async function folderName(): Promise<string | null> {
  return (await get())?.name ?? null;
}

export async function forgetFolder() {
  await put(null);
}

/**
 * Makes sure the chosen folder is still writable, asking again if the browser
 * has forgotten. Like the picker, asking again needs a click behind it -- so
 * this is called first thing in a click handler, before anything is awaited.
 */
export async function ensureFolderAccess(): Promise<boolean> {
  const handle = await get();

  if (handle == null) {
    return false;
  }

  if (await writable(handle)) {
    return true;
  }

  return await handle.requestPermission?.({ mode: "readwrite" }) == "granted";
}

/** A handle with no permission API of its own is one that needs no permission. */
async function writable(handle: HandlePermission) {
  return handle.queryPermission == null ||
    await handle.queryPermission({ mode: "readwrite" }) == "granted";
}

/** A sample already in the library, which is the sample. */
export interface SavedSample {
  /** Where it sits, for telling the reader. */
  path: string;

  /** Whether it was already there, rather than written now. */
  existed: boolean;
}

/**
 * Writes a sample into the chosen folder, creating the folders along the way,
 * and answers with where it went -- or null if no folder is available, which is
 * the caller's cue to fall back to the browser's download folder.
 *
 * A sample already in the library is left exactly as it is. The one on disk may
 * have been edited, renamed into place, or simply be the same bytes; none of
 * those is improved by writing over it.
 */
export async function saveToFolder(path: string, bytes: Bytes): Promise<SavedSample | null> {
  const root = await get();

  if (root == null || !await writable(root)) {
    return null;
  }

  // A folder with no name of its own contributes no segment to the path.
  const where = [root.name, path].filter(x => x.length > 0).join("/");

  if (await folderHas(path)) {
    return { path: where, existed: true };
  }

  const folder = await walk(root, path, { create: true });

  if (folder == null) {
    return null;
  }

  const file = await folder.directory.getFileHandle(folder.name, { create: true });
  const stream = await file.createWritable();

  try {
    await stream.write(bytes);
  } finally {
    await stream.close();
  }

  return { path: where, existed: false };
}

/** Whether the chosen folder already holds a sample at the given path. */
export async function folderHas(path: string): Promise<boolean> {
  return await handleFor(path) != null;
}

/**
 * A sample already in the library, read back rather than fetched again. The
 * file on disk is the one the reader has; downloading a second copy of it would
 * be work nobody asked for.
 */
export async function folderFile(path: string): Promise<Bytes | null> {
  const file = await handleFor(path);

  if (file == null) {
    return null;
  }

  return new Uint8Array(await (await file.getFile()).arrayBuffer());
}

async function handleFor(path: string): Promise<FileHandle | null> {
  const root = await get();

  if (root == null || !await writable(root)) {
    return null;
  }

  try {
    const folder = await walk(root, path, { create: false });
    return folder == null ? null : await folder.directory.getFileHandle(folder.name);
  } catch {
    // NotFoundError, which is the answer rather than a failure.
    return null;
  }
}

/** Follows a path down to the folder its file belongs in. */
async function walk(root: DirectoryHandle, path: string, options: { create: boolean }) {
  const segments = path.split("/").filter(x => x.length > 0);
  const name = segments.pop();

  if (name == null) {
    return null;
  }

  let directory = root;

  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment, options);
  }

  return { directory, name };
}

// --- where the handle is kept ---
//
// A directory handle can only be stored somewhere structured clone reaches, so
// chrome.storage is out and IndexedDB is in. It stays per-browser, which is
// right: a folder on this machine means nothing on another.

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);

    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function get(): Promise<DirectoryHandle | null> {
  try {
    const database = await open();

    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).get(KEY);

      request.onsuccess = () => resolve((request.result as DirectoryHandle) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    // A browser with no IndexedDB available is a browser with no chosen folder.
    return null;
  }
}

async function put(handle: DirectoryHandle | null) {
  const database = await open();

  await new Promise<void>((resolve, reject) => {
    const store = database.transaction(STORE, "readwrite").objectStore(STORE);
    const request = handle == null ? store.delete(KEY) : store.put(handle, KEY);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
