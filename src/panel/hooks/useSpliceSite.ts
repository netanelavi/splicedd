// Puts Splicedd behind splice.com's own controls.
//
// Splice already draws a download button and a drag handle on every sample row;
// without a subscription the first sends you to the pricing page and the second
// hands your DAW a link to Splice's desktop app. Both are taken over here, so
// they do on Splice's page exactly what the panel's own rows do.
//
// Nothing is bound to a row. The listeners sit on the document in the capture
// phase and work out what they're looking at when an event arrives, so Splice
// is free to re-render, paginate or navigate underneath -- there is nothing to
// re-attach, and no observer watching for it.

import { useCallback, useEffect, useMemo, useRef } from "react";

import { SpliceSample } from "../../splice/api";
import { errorMessage } from "../../chrome/messages";
import { showProgress } from "../../page/list";
import { SitePlayer } from "../../page/player";
import { SampleResolver } from "../../page/resolver";
import { ensureFolderAccess, folderHas } from "../../chrome/folder";
import { SampleEntry, liked, played } from "../../chrome/lists";
import {
  MENU_OPEN, PICK_MARK, QA, ROW_MARK, SITE_STYLES, SiteRow, closeMenus, controlOf, hook,
  isSearchListing, isTyping, likedBy, markLibrary, markLiked, markPicked, markRow, menuToggledBy,
  pageRequestedBy, permalinkOf, pickedRows, playedBy, rowOf, seekedBy, sharedBy, siteRows,
  unmarkRows
} from "../../page/site";
import { SampleStore } from "../sampleStore";
import { SampleActions } from "./useSampleActions";
import { Toasts } from "./useToasts";

/**
 * How many rows are prepared at once in the background. A drag has to hand over
 * a finished file the instant it starts, so waiting for a hover to begin the
 * work means the first drag of every row fails -- which is what "you have to
 * download it first" was. The page is prepared ahead of the reader instead,
 * a couple at a time so the fetching and decoding never crowds the page out.
 */
const AHEAD = 2;

/** How far an arrow key moves through a sample. */
const NUDGE = 0.05;

export function useSpliceSite(
  { resolver, store, actions, toasts, host, openPage }: {
    resolver: SampleResolver;
    store: SampleStore;
    actions: SampleActions;
    toasts: Toasts;
    host: HTMLElement;

    /** Moves to another page of the listing, without leaving the document. */
    openPage: (href: string) => void;
  }
) {
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = SITE_STYLES;

    document.head.append(style);
    return () => style.remove();
  }, []);

  // Splice's player has nothing to play on a page Splicedd drew, so its play
  // button is answered here for those rows and left alone on its own.
  const player = useMemo(() => new SitePlayer(showProgress), []);
  useEffect(() => () => player.dispose(), [player]);

  /**
   * The rows worth working on: every one of them on a listing Splicedd mirrors,
   * and elsewhere only the ones the page has already named, since naming the
   * rest would cost a search each before anyone has asked for anything.
   */
  const workRows = useCallback(() => {
    const all = siteRows();
    return isSearchListing() ? all : all.filter(row => resolver.peek(row) != null);
  }, [resolver]);

  /**
   * Renders a row's sample ahead of the drag that will need it: a drag payload
   * has to be attached the instant the drag begins, with nothing to await.
   */
  const warm = useCallback(async (row: SiteRow) => {
    if (row.element.dataset.splicedd == "ready") {
      return;
    }

    markRow(row.element, "loading");

    try {
      await store.file(await resolver.resolve(row));
      markRow(row.element, "ready");
    } catch {
      // Hovering asked for nothing, so it reports nothing. Pressing the button
      // runs the same path and does explain itself.
      markRow(row.element, null);
    }
  }, [resolver, store]);

  /**
   * Says which rows are already on disk and which have been marked, so neither
   * has to be discovered by hovering.
   */
  const survey = useCallback(async () => {
    const marked = new Set((await liked.read()).map(x => x.uuid));

    for (const row of workRows()) {
      try {
        const sample = await resolver.resolve(row);

        markLiked(row.element, marked.has(sample.uuid));
        markLibrary(row.element, await folderHas(store.pathOf(sample)));
      } catch {
        // A row nothing can name is a row nothing can be said about.
      }
    }
  }, [resolver, store, workRows]);

  /** Saves a run of rows one at a time, reporting as it goes. */
  const saveAll = useCallback(async (batch: SiteRow[]) => {
    if (batch.length == 0) {
      return;
    }

    // Asked first, while the click still counts, and waited for before the
    // first file is written; see the download action.
    const access = ensureFolderAccess().catch(() => false);

    const progress = toasts.show(`Saving 1 of ${batch.length}...`, { sticky: true });
    let saved = 0;

    await access;

    for (const [index, row] of batch.entries()) {
      toasts.update(progress, `Saving ${index + 1} of ${batch.length}...`);
      markRow(row.element, "loading");

      try {
        await actions.saveNow(await resolver.resolve(row));
        markLibrary(row.element, true);
        saved++;
      } catch {
        // Reported at the end: one toast per failure would bury the page.
      } finally {
        markRow(row.element, null);
      }
    }

    toasts.update(progress, saved == batch.length
      ? `Saved ${saved} samples`
      : `Saved ${saved} of ${batch.length}; the rest wouldn't download`);

    toasts.release(progress);
  }, [actions, resolver, toasts]);

  /**
   * Prepares every row worth preparing, the one under the pointer first. Each
   * is only ever prepared once: the store remembers what it has rendered, so
   * this is cheap to call again whenever the listing changes.
   */
  const prepare = useCallback(async (first?: SiteRow) => {
    const queue = [...(first == null ? [] : [first]), ...workRows()];
    const seen = new Set<HTMLElement>();

    const next = async () => {
      for (const row of queue) {
        if (!seen.has(row.element)) {
          seen.add(row.element);
          await warm(row);
        }
      }
    };

    await Promise.all(Array.from({ length: AHEAD }, next));
  }, [warm, workRows]);

  /**
   * Says again what is known about every row, after something that changes the
   * answer: a new folder, or a new format, is a new set of files on disk and a
   * new set of files to have ready.
   */
  const remark = useCallback(() => {
    unmarkRows();

    void survey();
    void prepare();
  }, [survey, prepare]);

  /** Starts a row playing, noting what it was. */
  const play = useCallback(async (row: SiteRow) => {
    try {
      await player.toggle(row.element, async () => {
        const sample = await resolver.resolve(row);

        void played.add(entryOf(sample));
        return store.preview(sample);
      });
    } catch (err) {
      toasts.show(errorMessage(err), { tone: "error" });
    }
  }, [player, resolver, store, toasts]);

  const hovered = useRef<HTMLElement | null>(null);

  useDocumentEvent("pointerover", event => {
    if (host.contains(event.target as Node)) {
      return;
    }

    const row = rowOf(event.target);

    if (row?.element == hovered.current) {
      return;
    }

    hovered.current = row?.element ?? null;

    // Whatever the reader is looking at goes to the front of the queue.
    if (row != null) {
      void warm(row);
    }
  });

  useDocumentEvent("click", event => {
    // A drawn row is a copy of Splice's markup and none of its behaviour, so
    // the things Splice would have handled are handled here -- its menu first,
    // since a click anywhere but on a menu's own button is how it is dismissed.
    const menu = menuToggledBy(event.target);
    closeMenus(menu ?? event.target);

    const requested = pageRequestedBy(event.target);

    // A modified click is the reader asking their browser for the link, not
    // asking Splicedd to turn the page.
    if (requested != null && !modified(event)) {
      event.preventDefault();
      event.stopPropagation();
      openPage(requested);

      return;
    }

    if (menu != null) {
      event.preventDefault();
      event.stopPropagation();
      menu.toggleAttribute(MENU_OPEN);

      return;
    }

    const shared = sharedBy(event.target);

    if (shared != null) {
      const link = permalinkOf(shared);

      event.preventDefault();
      event.stopPropagation();

      if (link == null) {
        toasts.show("Splice hasn't given this sample a link", { tone: "error" });
        return;
      }

      void navigator.clipboard.writeText(link).then(
        () => toasts.show("Link copied"),
        err => toasts.show(`Couldn't copy the link: ${errorMessage(err)}`, { tone: "error" })
      );

      return;
    }

    // Clicking along the waveform carries on from there, which is what a
    // waveform on a row is for.
    const seek = seekedBy(event.target, event.clientX);

    if (seek != null && seek.row.hasAttribute(ROW_MARK)) {
      const row = rowOf(seek.row);

      if (row != null) {
        event.preventDefault();
        event.stopPropagation();

        if (player.playing(seek.row)) {
          player.seek(seek.row, seek.at);
        } else {
          void play(row).then(() => player.seek(seek.row, seek.at));
        }

        return;
      }
    }

    if (playedBy(event.target)?.hasAttribute(ROW_MARK) == true) {
      const row = rowOf(event.target);

      if (row != null) {
        event.preventDefault();
        event.stopPropagation();

        void play(row);
        return;
      }
    }

    // Splice's heart needs an account; logged out it opens a sign-up dialog.
    // Alt-click still reaches it, for whoever has one.
    const hearted = event.altKey ? null : likedBy(event.target);

    if (hearted != null) {
      const row = rowOf(hearted);

      if (row != null) {
        event.preventDefault();
        event.stopPropagation();

        void resolver.resolve(row)
          .then(async sample => markLiked(row.element, await liked.toggle(entryOf(sample))))
          .catch(err => toasts.show(errorMessage(err), { tone: "error" }));

        return;
      }
    }

    // Alt-click still reaches Splice's own button, which for a subscriber
    // downloads the licensed file rather than the preview.
    if (event.altKey || controlOf(event.target) != "download") {
      return;
    }

    const row = rowOf(event.target);

    if (row == null) {
      return;
    }

    // Splice's own handler would send the user to its pricing page.
    event.preventDefault();
    event.stopPropagation();

    // The folder is asked for on the click itself, before the row is named:
    // naming it can take a request, and the browser only re-asks for a
    // folder while the click is still fresh.
    void ensureFolderAccess().catch(() => false);

    resolver.resolve(row).then(actions.download, err => {
      toasts.show(`Couldn't find ${row.filename} on Splice: ${errorMessage(err)}`, { tone: "error" });
    });
  });

  useDocumentEvent("keydown", event => {
    if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) {
      return;
    }

    // Whatever the pointer is resting on, which is how a list is worked
    // through without moving the hand back and forth to a button. A row the
    // page has since replaced is no longer anything to work on.
    const row = hovered.current?.isConnected == true ? rowOf(hovered.current) : null;

    if (row == null) {
      return;
    }

    if (event.key == "d") {
      event.preventDefault();
      void ensureFolderAccess().catch(() => false);
      void resolver.resolve(row).then(actions.download, () => {});
    } else if (event.key == "p") {
      event.preventDefault();
      row.element.querySelector<HTMLElement>(hook(QA.play))?.click();
    } else if ((event.key == "ArrowLeft" || event.key == "ArrowRight") && player.playing(row.element)) {
      // Nudging along a sample, which is what the desktop app's waveform did
      // for the arrow keys. Only while it plays: otherwise the keys are the
      // page's, and scroll it.
      event.preventDefault();
      player.nudge(row.element, event.key == "ArrowRight" ? NUDGE : -NUDGE);
    } else if (event.key == "l") {
      event.preventDefault();
      row.element.querySelector<HTMLElement>(hook(QA.like))?.click();
    } else if (event.key == "x") {
      event.preventDefault();
      markPicked(row.element, !row.element.hasAttribute(PICK_MARK));
    }
  });

  useDocumentEvent("dragstart", event => {
    if (controlOf(event.target) == null || event.dataTransfer == null) {
      return;
    }

    const row = rowOf(event.target);
    const sample = row == null ? null : resolver.peek(row);

    if (row == null || sample == null || !actions.attachDrag(event.dataTransfer, sample)) {
      // Nothing to hand over yet, so Splice's own drag is left to carry on.
      if (row != null) {
        void warm(row);
      }

      return;
    }

    // Splice's handler would replace the payload with a link to its desktop app.
    event.stopPropagation();
  });

  /** Saves the rows picked out with `x`, or the whole page if none are. */
  const saveBatch = useCallback(() => {
    const picked = pickedRows();
    const batch = picked.length > 0
      ? picked.map(element => rowOf(element)).filter(row => row != null)
      : siteRows();

    void saveAll(batch).then(() => {
      for (const element of picked) {
        markPicked(element, false);
      }
    });
  }, [saveAll]);

  // A fresh object every render would restart everything that depends on it.
  return useMemo(
    () => ({ survey, saveBatch, prepare, remark }),
    [survey, saveBatch, prepare, remark]
  );
}

/** What a list keeps about a sample: enough to find it again without Splice. */
export function entryOf(sample: SpliceSample): Omit<SampleEntry, "at"> {
  const pack = sample.parents?.items?.[0];

  return {
    uuid: sample.uuid,
    name: sample.name,
    pack: pack?.name ?? null,
    cover: pack?.files?.find(x => x.asset_file_type_slug == "cover_image")?.url ?? null
  };
}

/** Whether the reader asked their browser for the link rather than for the page. */
function modified(event: MouseEvent) {
  return event.button != 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

/**
 * Listens on the document itself, in the capture phase, so an event on Splice's
 * markup is seen before Splice's own handlers run. The handler is kept in a ref
 * because it closes over state that changes on every render, and re-registering
 * a listener that often is how listeners get lost.
 */
function useDocumentEvent<K extends keyof DocumentEventMap>(
  type: K,
  handler: (event: DocumentEventMap[K]) => void
) {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    const listener = (event: Event) => latest.current(event as DocumentEventMap[K]);

    document.addEventListener(type, listener, true);
    return () => document.removeEventListener(type, listener, true);
  }, [type]);
}
