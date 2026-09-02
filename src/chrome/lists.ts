// The lists Splicedd keeps of its own: what has been saved, what has been
// marked, what has been played, and what has been searched for.
//
// All four behave the same way -- newest first, one entry per thing, the oldest
// forgotten past a limit -- so they are one list with four names rather than
// four lists that drift apart.
//
// They live in `chrome.storage.local` rather than `sync`: they grow, and three
// of them describe files on this machine, which mean nothing on another.

/** Everything in a list has an identity and a moment. */
export interface Listed {
  /** What makes this entry the same entry when it comes round again. */
  uuid: string;

  at: number;
}

export class StoredList<T extends Listed> {
  /**
   * Changes take turns. Each one reads the list, alters it and writes it back,
   * and two doing so at once -- a sample played as another is saved -- would
   * have the second write over the first.
   */
  private turn: Promise<unknown> = Promise.resolve();

  constructor(private readonly key: string, private readonly limit: number) {}

  async read(): Promise<T[]> {
    try {
      const stored = await chrome.storage.local.get(this.key);
      return (stored[this.key] as T[] | undefined) ?? [];
    } catch {
      // A browser with no storage is a browser with an empty list.
      return [];
    }
  }

  /** Adds an entry, moving one already listed back to the top. */
  add(entry: Omit<T, "at">) {
    return this.change(async () => {
      const kept = (await this.read()).filter(x => x.uuid != entry.uuid);
      await this.write([{ ...entry, at: Date.now() } as T, ...kept]);
    });
  }

  /** Adds or removes an entry, and answers with whether it is now listed. */
  toggle(entry: Omit<T, "at">): Promise<boolean> {
    return this.change(async () => {
      const current = await this.read();
      const kept = current.filter(x => x.uuid != entry.uuid);

      // Nothing was removed, so it wasn't listed, so this lists it.
      const listed = kept.length == current.length;

      await this.write(listed ? [{ ...entry, at: Date.now() } as T, ...kept] : kept);
      return listed;
    });
  }

  remove(uuid: string) {
    return this.change(async () => {
      await this.write((await this.read()).filter(x => x.uuid != uuid));
    });
  }

  clear() {
    return this.change(() => this.write([]));
  }

  /** Calls back whenever the list changes, in this tab or any other. */
  onChanged(listener: () => void) {
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area == "local" && this.key in changes) {
        listener();
      }
    };

    try {
      chrome.storage.onChanged.addListener(onChanged);
    } catch {
      // The extension was reloaded underneath this page: there is nothing to
      // listen to, and a list that never updates beats a view that fails.
      return () => {};
    }

    return () => chrome.storage.onChanged.removeListener(onChanged);
  }

  private change<R>(run: () => Promise<R>): Promise<R> {
    const result = this.turn.then(run, run);
    this.turn = result.catch(() => {});

    return result;
  }

  private async write(entries: T[]) {
    try {
      await chrome.storage.local.set({ [this.key]: entries.slice(0, this.limit) });
    } catch (err) {
      console.warn(`[splicedd] couldn't record ${this.key}:`, err);
    }
  }
}

/** A sample Splicedd knows about without Splice. */
export interface SampleEntry extends Listed {
  /** The name Splice gave it, which can itself carry directories. */
  name: string;

  pack: string | null;
  cover: string | null;

  /** Where it sits in the library, for one that has actually been saved. */
  path?: string;
}

/** A listing that was looked at, which is an address and what it returned. */
export interface SearchEntry extends Listed {
  /** What was typed, or the part of the address that stands for it. */
  query: string;

  /** The address to go back to. */
  url: string;

  records: number;
}

export const saved = new StoredList<SampleEntry>("history", 500);
export const liked = new StoredList<SampleEntry>("likes", 500);
export const played = new StoredList<SampleEntry>("played", 200);
export const searched = new StoredList<SearchEntry>("searches", 50);
