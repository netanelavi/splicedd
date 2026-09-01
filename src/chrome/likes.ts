// Samples the reader has marked, kept by Splicedd rather than by Splice.
//
// Splice's own heart needs an account and a session; logged out it opens a
// sign-up dialog and nothing else. This is the same gesture answered locally,
// so a sample can be set aside without one -- and, unlike Splice's, what is
// marked here can be dragged into a DAW.

const KEY = "likes";

/** What a liked sample is, which is what it takes to find it again. */
export interface LikedSample {
  uuid: string;

  /** The name Splice gave it, which can itself carry directories. */
  name: string;

  pack: string | null;
  cover: string | null;
  likedAt: number;
}

export async function likes(): Promise<LikedSample[]> {
  try {
    const stored = await chrome.storage.local.get(KEY);
    return (stored[KEY] as LikedSample[] | undefined) ?? [];
  } catch {
    return [];
  }
}

/** Marks or unmarks a sample, and answers with which it now is. */
export async function toggleLike(sample: Omit<LikedSample, "likedAt">): Promise<boolean> {
  const current = await likes();
  const kept = current.filter(x => x.uuid != sample.uuid);

  // Nothing was removed, so it wasn't marked, so this marks it.
  const liked = kept.length == current.length;

  await write(liked ? [{ ...sample, likedAt: Date.now() }, ...kept] : kept);
  return liked;
}

export async function unlike(uuid: string) {
  await write((await likes()).filter(x => x.uuid != uuid));
}

/** Calls back whenever the list changes, in this tab or any other. */
export function onLikesChanged(listener: () => void) {
  const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area == "local" && KEY in changes) {
      listener();
    }
  };

  chrome.storage.onChanged.addListener(onChanged);
  return () => chrome.storage.onChanged.removeListener(onChanged);
}

async function write(entries: LikedSample[]) {
  try {
    await chrome.storage.local.set({ [KEY]: entries });
  } catch (err) {
    console.warn("[splicedd] couldn't record what was liked:", err);
  }
}
