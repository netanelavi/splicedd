import { useCallback, useMemo, useRef } from "react";

import { SpliceSample } from "../../splice/api";
import { errorMessage } from "../../chrome/messages";
import { callWorker } from "../../chrome/messages";
import { ensureFolderAccess, saveToFolder } from "../../chrome/folder";
import { saved } from "../../chrome/lists";
import { saveFile } from "../../chrome/net";
import { DOWNLOADS_FOLDER } from "../../chrome/settings";
import { joinPath } from "../../splice/paths";
import { SampleFile, SampleStore } from "../sampleStore";
import { attachFileDrag } from "../drag";
import { Toasts } from "./useToasts";

export interface SampleActions {
  /** Saves a sample to the download folder, reporting how it went. */
  download: (sample: SpliceSample) => void;

  /**
   * Renders a sample and puts it in the library, throwing if it can't. For a
   * batch, which counts its own failures rather than raising one toast each.
   */
  saveNow: (sample: SpliceSample) => Promise<void>;

  /**
   * Attaches a sample to a drag that has already begun, answering with the
   * file it attached, or null if there was none to attach yet. Splice's own
   * rows are dragged through a plain DOM event, so this takes the transfer
   * rather than a React one.
   */
  attachDrag: (transfer: DataTransfer, sample: SpliceSample) => SampleFile | null;
}

/** Everything the user can do with a sample once it's on screen. */
export function useSampleActions(store: SampleStore, toasts: Toasts): SampleActions {
  // Downloads are guarded with a ref rather than by disabling the button: a
  // control that changes while the mouse is down swallows its own click.
  const downloading = useRef(new Set<string>());

  /** Renders the sample, reporting failures once rather than at every call site. */
  const render = useCallback(async (sample: SpliceSample): Promise<SampleFile | null> => {
    try {
      return await store.file(sample);
    } catch (err) {
      toasts.show(`Couldn't prepare ${sample.name}: ${errorMessage(err)}`, { tone: "error" });
      return null;
    }
  }, [store, toasts]);

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
    const written = await saveToFolder(file.path, file.blob);

    if (written != null) {
      void record();

      if (announce) {
        // A folder chosen through the browser can't be revealed in the file
        // manager -- only a download the browser itself made can be -- so what
        // is offered instead is the folder, copied. Not the file "opened": a
        // blob opened in a tab is a player, and a file saved from that player
        // is named after the blob, which is an id.
        toasts.show(
          written.existed ? `${file.name} is already in your library` : `Saved ${written.path}`,
          { actions: [{ label: "Copy folder", run: () => copyFolder(written.path, toasts) }] }
        );
      }

      return;
    }

    // Falling back to the browser's download folder, which is everyone's
    // download folder: the sample library goes in a folder of its own there,
    // where a chosen one is already a folder of its own.
    const filename = joinPath(DOWNLOADS_FOLDER, file.path);
    const download = await saveFile(file.blob, file.mime, filename);
    void record();

    if (announce) {
      toasts.show(download.existed ? `${file.name} is already in your library` : `Saved ${filename}`, {
        actions: [{
          label: "Show in folder",
          run: () => void callWorker({ kind: "reveal-download", downloadId: download.downloadId })
        }]
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

  const download = useCallback((sample: SpliceSample) => {
    if (downloading.current.has(sample.uuid)) {
      return;
    }

    // Asked before anything is awaited: re-asking for a folder the browser
    // has forgotten only works while the click that started this still
    // counts. And waited for before anything is written, or a prompt still
    // open would send the file to the browser's downloads instead.
    const access = ensureFolderAccess().catch(() => false);

    downloading.current.add(sample.uuid);

    void render(sample)
      .then(async file => {
        if (file != null) {
          await access;
          await save(sample, file, true);
        }
      })
      .finally(() => downloading.current.delete(sample.uuid));
  }, [render, save]);

  const attachDrag = useCallback((transfer: DataTransfer, sample: SpliceSample) => {
    const file = store.peek(sample);

    // A drag payload has to be attached synchronously, so a sample that hasn't
    // been rendered yet can't be dragged. The page is prepared ahead of the
    // reader, which covers all but the very fastest drag.
    if (file == null) {
      void render(sample);
      toasts.show("Getting the sample ready - drag it again in a moment");
      return null;
    }

    attachFileDrag(transfer, file);

    // Chromium only writes the file out if the drop target accepts it, and a
    // DAW that refuses would leave the user with nothing. Saving in the
    // background means the sample reaches the library either way -- which is
    // what the desktop app did, since it dragged out of the library itself.
    void save(sample, file, false);

    return file;
  }, [store, render, save, toasts]);

  return useMemo(() => ({ download, saveNow, attachDrag }), [download, saveNow, attachDrag]);
}

/**
 * Copies the folder the sample went into, without the file itself, so it can be
 * pasted into a file manager. It starts at the folder that was chosen: the
 * picker hands over a name and a handle, never a path on disk, so where that
 * folder sits is something only the reader knows.
 */
function copyFolder(path: string, toasts: Toasts) {
  const folder = path.split("/").slice(0, -1).join("/");

  void navigator.clipboard.writeText(folder).then(
    () => toasts.show(`Copied ${folder}`),
    err => toasts.show(`Couldn't copy the folder: ${errorMessage(err)}`, { tone: "error" })
  );
}
