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

import { useCallback, useEffect, useRef } from "react";

import { errorMessage } from "../../chrome/messages";
import { SampleResolver } from "../../page/resolver";
import { SITE_STYLES, SiteRow, controlOf, markRow, rowOf } from "../../page/site";
import { SampleStore } from "../sampleStore";
import { SampleActions } from "./useSampleActions";
import { Toasts } from "./useToasts";

/** How long the pointer rests on a row before its file is built. */
const DWELL_MS = 120;

export function useSpliceSite(
  { resolver, store, actions, toasts, host }: {
    resolver: SampleResolver;
    store: SampleStore;
    actions: SampleActions;
    toasts: Toasts;
    host: HTMLElement;
  }
) {
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = SITE_STYLES;

    document.head.append(style);
    return () => style.remove();
  }, []);

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
