import { DragEvent, useCallback, useMemo, useRef, useState } from "react";

import { SpliceSample } from "../../splice/api";
import { errorMessage } from "../../chrome/messages";
import { callWorker } from "../../chrome/messages";
import { ensureFolderAccess, saveToFolder } from "../../chrome/folder";
import { saved } from "../../chrome/lists";
import { saveFile } from "../../chrome/net";
import { DOWNLOADS_FOLDER } from "../../chrome/settings";
import { joinPath } from "../../splice/paths";
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
   * Renders a sample and puts it in the library, throwing if it can't. For a
   * batch, which counts its own failures rather than raising one toast each.
   */
  saveNow: (sample: SpliceSample) => Promise<void>;

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

  const write = useCallback(async (sample: SpliceSample, file: SampleFile, announce: boolean) => {
    const record = () => saved.add({
      uuid: sample.uuid,
      name: file.name,
      path: file.path,
      pack: sample.parents?.items?.[0]?.name ?? null,
      cover: sample.parents?.items?.[0]?.files
        ?.find(x => x.asset_file_type_slug == "cover_image")?.url ?? null
    });

    // A folder the reader chose is written to directly, which is the only way
    // the file keeps the name and the place it was given.
    const written = await saveToFolder(file.path, file.bytes);

    if (written != null) {
      void record();

      if (announce) {
        toasts.show(written.existed
          ? `${file.name} is already in your library`
          : `Saved ${written.path}`);
      }

      return;
    }

    // Falling back to the browser's download folder, which is everyone's
    // download folder: the sample library goes in a folder of its own there,
    // where a chosen one is already a folder of its own.
    const filename = joinPath(DOWNLOADS_FOLDER, file.path);
    const download = await saveFile(file.bytes, file.mime, filename);
    void record();

    if (announce) {
      toasts.show(download.existed ? `${file.name} is already in your library` : `Saved ${filename}`, {
        action: {
          label: "Show",
          run: () => void callWorker({ kind: "reveal-download", downloadId: download.downloadId })
        }
      });
    }
  }, [toasts]);

  /** The same, with a failure reported rather than raised. */
  const save = useCallback(async (sample: SpliceSample, file: SampleFile, announce: boolean) => {
    try {
      await write(sample, file, announce);
    } catch (err) {
      toasts.show(`Couldn't save ${file.name}: ${errorMessage(err)}`, { tone: "error" });
    }
  }, [write, toasts]);

  const saveNow = useCallback(async (sample: SpliceSample) => {
    await write(sample, await store.file(sample), false);
  }, [store, write]);

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
      .then(file => { if (file != null) return save(sample, file, true); })
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
    // background means the sample reaches the library either way -- which is
    // what the desktop app did, since it dragged out of the library itself.
    void save(sample, file, false);

    return true;
  }, [store, prepare, save, toasts]);

  const dragStart = useCallback((event: DragEvent, sample: SpliceSample) => {
    // A drag that started on a button belongs to the button.
    if (startedOnControl(event) || !attachDrag(event.dataTransfer, sample)) {
      event.preventDefault();
    }
  }, [attachDrag]);

  return useMemo(
    () => ({ busy, prepare, download, saveNow, attachDrag, dragStart }),
    [busy, prepare, download, saveNow, attachDrag, dragStart]
  );
}
