import { useEffect, useState } from "react";

import { HistoryEntry, forget, forgetAll, history, onHistoryChanged } from "../../chrome/history";
import { LikedSample, likes, onLikesChanged, unlike } from "../../chrome/likes";
import { Toasts } from "../hooks/useToasts";
import SavedList from "./SavedList";

/** Subscribes to one of the two lists Splicedd keeps of its own. */
function useSaved<T>(read: () => Promise<T[]>, subscribe: (listener: () => void) => () => void) {
  const [entries, setEntries] = useState<T[] | null>(null);

  useEffect(() => {
    const refresh = () => void read().then(setEntries);

    refresh();
    return subscribe(refresh);
    // Both are module-level functions, so neither ever changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return entries;
}

export function RecentView({ toasts }: { toasts: Toasts }) {
  const entries = useSaved<HistoryEntry>(history, onHistoryChanged);

  return (
    <SavedList
      entries={entries?.map(x => ({ ...x, at: x.savedAt, path: x.path })) ?? null}
      empty="Nothing saved yet. Download a sample from a Splice row and it shows up here, ready to drag into your DAW again without leaving the page."
      note="Dragging one of these reads it from your library rather than from Splice, so nothing is downloaded twice."
      toasts={toasts}
      onForget={uuid => void forget(uuid)}
      onClear={() => void forgetAll()}
    />
  );
}

export function LikedView({ toasts }: { toasts: Toasts }) {
  const entries = useSaved<LikedSample>(likes, onLikesChanged);

  return (
    <SavedList
      entries={entries?.map(x => ({ ...x, at: x.likedAt })) ?? null}
      empty="Nothing marked yet. The heart on a Splice row marks a sample here, with no account and no sign-up dialog."
      note="Marking a sample doesn't download it. One that is already in your library can be dragged straight out of this list."
      toasts={toasts}
      onForget={uuid => void unlike(uuid)}
      onClear={() => void Promise.all((entries ?? []).map(x => unlike(x.uuid)))}
    />
  );
}
