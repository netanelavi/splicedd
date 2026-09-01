import { DragEvent, useEffect, useState } from "react";
import { FolderOpen, Trash2 } from "lucide-react";

import { folderFile } from "../../chrome/folder";
import { errorMessage } from "../../chrome/messages";
import { settings } from "../../chrome/settings";
import { libraryPath } from "../../splice/paths";
import { Toasts } from "../hooks/useToasts";
import { attachFileDrag } from "../drag";
import { Button, IconButton } from "./primitives";

/** Guessed from the extension, which is all a library path carries. */
const MIME_TYPES: Record<string, string> = { wav: "audio/wav", mp3: "audio/mpeg" };

/** A sample Splicedd knows about without Splice: saved, or marked. */
export interface SavedSample {
  uuid: string;
  name: string;
  pack: string | null;
  cover: string | null;

  /**
   * Where it sits in the library, for something already saved. Anything else
   * works it out from the pack and the name, which is the same rule.
   */
  path?: string;

  /** When it was saved or marked, shown as how long ago. */
  at: number;
}

/**
 * A list of samples Splicedd holds on its own -- what it has saved, and what
 * has been marked. Either is dragged out of the library itself: the bytes come
 * off disk, so it costs nothing and works long after Splice's page is gone.
 */
export default function SavedList(
  { entries, empty, note, toasts, onForget, onClear }: {
    entries: SavedSample[] | null;
    empty: string;
    note: string;
    toasts: Toasts;
    onForget: (uuid: string) => void;
    onClear: () => void;
  }
) {
  if (entries == null) {
    return <div className="sd-settings"><p className="sd-hint">Reading...</p></div>;
  }

  if (entries.length == 0) {
    return <div className="sd-settings"><p className="sd-hint">{empty}</p></div>;
  }

  return (
    <div className="sd-settings">
      <div className="sd-row-between">
        <span className="sd-label">{entries.length}</span>
        <Button variant="link" onClick={onClear}>Clear</Button>
      </div>

      <div className="sd-history">
        {entries.map(entry => (
          <SavedRow key={entry.uuid} entry={entry} toasts={toasts} onForget={onForget} />
        ))}
      </div>

      <p className="sd-hint">{note}</p>
    </div>
  );
}

function SavedRow(
  { entry, toasts, onForget }: {
    entry: SavedSample;
    toasts: Toasts;
    onForget: (uuid: string) => void;
  }
) {
  const [url, setUrl] = useState<string | null>(null);
  const path = entry.path ?? libraryPath(entry.pack, entry.name, settings().format);

  // The blob is this row's to release.
  useEffect(() => () => { if (url != null) URL.revokeObjectURL(url); }, [url]);

  // A drag payload has to be attached the instant the drag begins, so the file
  // is read off disk while the pointer is merely over the row.
  async function load() {
    if (url != null) {
      return true;
    }

    const bytes = await folderFile(path);

    if (bytes == null) {
      return false;
    }

    setUrl(URL.createObjectURL(new Blob([bytes], { type: mimeOf(path) })));
    return true;
  }

  function onDragStart(event: DragEvent) {
    if (url == null) {
      event.preventDefault();

      void load().then(
        found => toasts.show(found
          ? "Reading it off disk - drag it again in a moment"
          : `That one isn't in your library yet; download it from its Splice row first`,
          found ? {} : { tone: "error" }),
        err => toasts.show(errorMessage(err), { tone: "error" })
      );

      return;
    }

    attachFileDrag(event.dataTransfer, { url, mime: mimeOf(path), name: path.split("/").pop()! });
  }

  return (
    <div
      className="sd-history-row"
      draggable
      title={`${path}\nDrag into your DAW`}
      onPointerEnter={() => void load()}
      onDragStart={onDragStart}
    >
      {entry.cover != null
        ? <img src={entry.cover} alt="" draggable={false} />
        : <span className="sd-history-cover"><FolderOpen size={14} aria-hidden /></span>}

      <div className="sd-history-text">
        <strong>{entry.name.split("/").pop()}</strong>
        <small>{entry.pack ?? "Splice"} &middot; {when(entry.at)}</small>
      </div>

      <div data-no-drag="true">
        <IconButton label="Forget this one" onClick={() => onForget(entry.uuid)}>
          <Trash2 size={15} />
        </IconButton>
      </div>
    </div>
  );
}

function mimeOf(path: string) {
  return MIME_TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** How long ago, in the roughest terms that are still useful. */
function when(at: number) {
  const minutes = Math.round((Date.now() - at) / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;

  return new Date(at).toLocaleDateString();
}
