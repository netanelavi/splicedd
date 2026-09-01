import { useEffect, useState } from "react";

import { Listed, SampleEntry, SearchEntry, StoredList, liked, played, saved, searched } from "../../chrome/lists";
import { Toasts } from "../hooks/useToasts";
import SavedList from "./SavedList";
import SearchList from "./SearchList";

/** Subscribes to one of the lists Splicedd keeps of its own. */
function useList<T extends Listed>(list: StoredList<T>) {
  const [entries, setEntries] = useState<T[] | null>(null);

  useEffect(() => {
    const refresh = () => void list.read().then(setEntries);

    refresh();
    return list.onChanged(refresh);
  }, [list]);

  return entries;
}

function SampleView(
  { list, empty, note, toasts }: {
    list: StoredList<SampleEntry>;
    empty: string;
    note: string;
    toasts: Toasts;
  }
) {
  const entries = useList(list);

  return (
    <SavedList
      entries={entries}
      empty={empty}
      note={note}
      toasts={toasts}
      onForget={uuid => void list.remove(uuid)}
      onClear={() => void list.clear()}
    />
  );
}

export function SavedView({ toasts }: { toasts: Toasts }) {
  return (
    <SampleView
      list={saved}
      toasts={toasts}
      empty="Nothing saved yet. Download a sample from a Splice row and it shows up here, ready to drag into your DAW again without leaving the page."
      note="Dragging one of these reads it from your library rather than from Splice, so nothing is downloaded twice."
    />
  );
}

export function LikedView({ toasts }: { toasts: Toasts }) {
  return (
    <SampleView
      list={liked}
      toasts={toasts}
      empty="Nothing marked yet. The heart on a Splice row marks a sample here, with no account and no sign-up dialog."
      note="Marking a sample doesn't download it. One already in your library can be dragged straight out of this list."
    />
  );
}

export function PlayedView({ toasts }: { toasts: Toasts }) {
  return (
    <SampleView
      list={played}
      toasts={toasts}
      empty="Nothing played yet. Whatever you listen to on splice.com is noted here, whether you keep it or not."
      note="A sample you didn't download isn't on disk to drag; its Splice row still is, and the search that finds it is one click away."
    />
  );
}

export function SearchedView() {
  const entries = useList<SearchEntry>(searched);
  return <SearchList entries={entries} onForget={uuid => void searched.remove(uuid)} onClear={() => void searched.clear()} />;
}
