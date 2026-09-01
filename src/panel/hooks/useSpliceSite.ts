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
import { SitePlayer } from "../../page/player";
import { SampleResolver } from "../../page/resolver";
import { folderHas } from "../../chrome/folder";
import { SampleEntry, liked, played } from "../../chrome/lists";
import {
  PICK_MARK, QA, ROW_MARK, SITE_STYLES, SiteRow, controlOf, hook, isTyping, likedBy, markLibrary,
  markLiked, markPicked, markRow, menuToggledBy, pageRequestedBy, permalinkOf, pickedRows,
  playedBy, rowOf, sharedBy, siteRows
} from "../../page/site";
import { SampleStore } from "../sampleStore";
import { SampleActions } from "./useSampleActions";
import { Toasts } from "./useToasts";

/** How long the pointer rests on a row before its file is built. */
const DWELL_MS = 120;

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
  const player = useMemo(() => new SitePlayer(), []);
  useEffect(() => () => player.dispose(), [player]);

  /**
   * Renders a row's sample ahead of the drag that will need it: a drag payload
   * has to be attached the instant the drag begins, with nothing to await.
   */
  const warm = useCallback(async (row: SiteRow) => {
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

    for (const row of siteRows()) {
      try {
        const sample = await resolver.resolve(row);

        markLiked(row.element, marked.has(sample.uuid));
        markLibrary(row.element, await folderHas(store.pathOf(sample)));
      } catch {
        // A row nothing can name is a row nothing can be said about.
      }
    }
  }, [resolver, store]);

  /** Saves a run of rows one at a time, reporting as it goes. */
  const saveAll = useCallback(async (batch: SiteRow[]) => {
    if (batch.length == 0) {
      return;
    }

    const progress = toasts.show(`Saving 1 of ${batch.length}...`, { sticky: true });
    let saved = 0;

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

  const hovered = useRef<HTMLElement | null>(null);
  const dwell = useRef(0);

  useDocumentEvent("pointerover", event => {
    if (host.contains(event.target as Node)) {
      return;
    }

    const row = rowOf(event.target);

    if (row?.element == hovered.current) {
      return;
    }

    clearTimeout(dwell.current);
    hovered.current = row?.element ?? null;

    if (row != null) {
      dwell.current = window.setTimeout(() => void warm(row), DWELL_MS);
    }
  });

  useDocumentEvent("click", event => {
    const requested = pageRequestedBy(event.target);

    // A modified click is the reader asking their browser for the link, not
    // asking Splicedd to turn the page.
    if (requested != null && !modified(event)) {
      event.preventDefault();
      event.stopPropagation();
      openPage(requested);

      return;
    }

    // A drawn row is a copy of Splice's markup and none of its behaviour, so
    // the things Splice would have handled are handled here.
    const menu = menuToggledBy(event.target);

    if (menu != null) {
      event.preventDefault();
      event.stopPropagation();
      menu.toggleAttribute("data-splicedd-open");

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

    if (playedBy(event.target)?.hasAttribute(ROW_MARK) == true) {
      const row = rowOf(event.target);

      if (row != null) {
        event.preventDefault();
        event.stopPropagation();

        void player.toggle(row.element, async () => {
          const sample = await resolver.resolve(row);

          void played.add(entryOf(sample));
          return store.preview(sample);
        }).catch(err => toasts.show(errorMessage(err), { tone: "error" }));

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

    resolver.resolve(row).then(actions.download, err => {
      toasts.show(`Couldn't find ${row.filename} on Splice: ${errorMessage(err)}`, { tone: "error" });
    });
  });

  useDocumentEvent("keydown", event => {
    if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) {
      return;
    }

    // Whatever the pointer is resting on, which is how a list is worked
    // through without moving the hand back and forth to a button.
    const row = hovered.current == null ? null : rowOf(hovered.current);

    if (row == null) {
      return;
    }

    if (event.key == "d") {
      event.preventDefault();
      void resolver.resolve(row).then(actions.download, () => {});
    } else if (event.key == "p") {
      event.preventDefault();
      row.element.querySelector<HTMLElement>(hook(QA.play))?.click();
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
  return useMemo(() => ({ survey, saveBatch }), [survey, saveBatch]);
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
