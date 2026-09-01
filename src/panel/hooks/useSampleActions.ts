import { DragEvent, useCallback, useRef, useState } from "react";

import { SpliceSample } from "../../splice/api";
import { errorMessage } from "../../chrome/messages";
import { callWorker } from "../../chrome/messages";
import { ensureFolderAccess, saveToFolder } from "../../chrome/folder";
import { saveFile } from "../../chrome/net";
import { settings } from "../../chrome/settings";
import { SampleFile, SampleStore } from "../sampleStore";
import { attachFileDrag, startedOnControl } from "../drag";
import { Toasts } from "./useToasts";

export interface SampleActions {
  /** Samples whose file is being prepared right now. */
  busy: ReadonlySet<string>;

  /** Starts turning a sample into a file, so a drag won't have to wait for it. */
  prepare: (sample: SpliceSample) => void;

  /** Saves a sample to the download folder. */
  download: (sample: SpliceSample) => void;

  /**
   * Attaches a sample to a drag that has already begun, reporting whether it
   * could. Splice's own rows are dragged through a plain DOM event, so this
   * takes the transfer rather than a React one.
   */
  attachDrag: (transfer: DataTransfer, sample: SpliceSample) => boolean;

  dragStart: (event: DragEvent, sample: SpliceSample) => void;
}

/** Everything the user can do with a sample once it's on screen. */
export function useSampleActions(store: SampleStore, toasts: Toasts): SampleActions {
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  // Downloads are guarded with a ref rather than by disabling the button: a
  // control that changes while the mouse is down swallows its own click.
  const downloading = useRef(new Set<string>());

  const setBusyState = useCallback((uuid: string, value: boolean) => {
    setBusy(current => {
      if (current.has(uuid) == value)
        return current;

      const next = new Set(current);
      value ? next.add(uuid) : next.delete(uuid);
      return next;
    });
  }, []);

  /** Renders the sample, reporting failures once rather than at every call site. */
  const render = useCallback(async (sample: SpliceSample): Promise<SampleFile | null> => {
    setBusyState(sample.uuid, true);

    try {
      return await store.file(sample);
    } catch (err) {
      toasts.show(`Couldn't prepare ${sample.name}: ${errorMessage(err)}`, { tone: "error" });
      return null;
    } finally {
      setBusyState(sample.uuid, false);
    }
  }, [store, toasts, setBusyState]);

  const save = useCallback(async (file: SampleFile, announce: boolean) => {
    try {
      // A folder the reader chose is written to directly, which is the only way
      // the file keeps the name and the place it was given.
      const written = await saveToFolder(file.path, file.bytes);

      if (written != null) {
        if (announce) {
          toasts.show(`Saved ${written}`);
        }

        return;
      }

      const saved = await saveFile(file.bytes, file.mime, file.path);

      if (announce) {
        toasts.show(saved.existed ? `${file.name} is already in your library` : `Saved ${file.path}`, {
          action: {
            label: "Show",
            run: () => void callWorker({ kind: "reveal-download", downloadId: saved.downloadId })
          }
        });
      }
    } catch (err) {
      toasts.show(`Couldn't save ${file.name}: ${errorMessage(err)}`, { tone: "error" });
    }
  }, [toasts]);

  const prepare = useCallback((sample: SpliceSample) => {
    if (store.peek(sample) == null) {
      void render(sample);
    }
  }, [store, render]);

  const download = useCallback((sample: SpliceSample) => {
    if (downloading.current.has(sample.uuid)) {
      return;
    }

    // Before anything is awaited: re-asking for a folder the browser has
    // forgotten only works while the click that started this still counts.
    void ensureFolderAccess();

    downloading.current.add(sample.uuid);

    void render(sample)
      .then(file => { if (file != null) return save(file, true); })
      .finally(() => downloading.current.delete(sample.uuid));
  }, [render, save]);

  const attachDrag = useCallback((transfer: DataTransfer, sample: SpliceSample) => {
    const file = store.peek(sample);

    // A drag payload has to be attached synchronously, so a sample that hasn't
    // been rendered yet can't be dragged. Rendering starts on hover and on
    // mouse-down, which covers all but the very fastest drag.
    if (file == null) {
      prepare(sample);
      toasts.show("Getting the sample ready - drag it again in a moment");
      return false;
    }

    attachFileDrag(transfer, file);

    // Chromium only writes the file out if the drop target accepts it, and a
    // DAW that refuses would leave the user with nothing. Saving in the
    // background means the sample is on disk either way.
    if (settings().saveOnDrag) {
      void save(file, false);
    }

    return true;
  }, [store, prepare, save, toasts]);

  const dragStart = useCallback((event: DragEvent, sample: SpliceSample) => {
    // A drag that started on a button belongs to the button.
    if (startedOnControl(event) || !attachDrag(event.dataTransfer, sample)) {
      event.preventDefault();
    }
  }, [attachDrag]);

  return { busy, prepare, download, attachDrag, dragStart };
}
