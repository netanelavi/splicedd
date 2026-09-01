// Walks splice.com's result pages.
//
// Splice paginates at the very bottom of a long list, which is the wrong end of
// the page from where the samples are. This exposes the same movement as a
// control that stays put, and reports where the page currently is.
//
// Turning a page follows Splice's own link when it has one, so its router stays
// in charge and the page changes exactly as it would have. When it doesn't --
// nothing says every listing has a paginator -- Splicedd walks the address
// itself, which is the same `?page=` Splice's own links carry.

import { hasRows, pageLink, pageSummary } from "./site";

export interface PageState {
  page: number;

  /** Splice's own wording for where the page is, when it offers one. */
  summary: string | null;

  hasPrev: boolean;
  hasNext: boolean;
}

export type PageDirection = "prev" | "next";

const PAGE_PARAM = "page";

export class Pager {
  private state: PageState | null = null;
  private readonly listeners = new Set<() => void>();
  private frame = 0;

  /** Starts following the page, and returns the function that stops it. */
  start() {
    // A page turn replaces the list, so watching the document is watching the
    // pagination -- with none of the guesswork about where the list lives.
    const observer = new MutationObserver(() => this.schedule());
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("popstate", this.schedule);
    this.read();

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", this.schedule);

      cancelAnimationFrame(this.frame);
      this.listeners.clear();
    };
  }

  readonly current = () => this.state;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly turn = (direction: PageDirection) => {
    const link = pageLink(direction);

    if (link != null) {
      link.click();
      return;
    }

    const page = currentPage() + (direction == "next" ? 1 : -1);

    if (page < 1) {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set(PAGE_PARAM, page.toString());

    window.location.assign(url.href);
  };

  /** Splice re-renders in bursts; one read per frame is plenty. */
  private readonly schedule = () => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.read());
  };

  private read() {
    const next = hasRows() ? state() : null;

    if (same(this.state, next)) {
      return;
    }

    this.state = next;

    for (const listener of this.listeners) {
      listener();
    }
  }
}

function state(): PageState {
  const page = currentPage();
  const summary = pageSummary();
  const total = totalPages(summary);

  return {
    page,
    summary,
    hasPrev: page > 1,

    // A listing with no paginator to read is walked optimistically: asking for
    // the page after the last one is Splice's to answer, not ours to predict.
    hasNext: total == null ? true : page < total
  };
}

function currentPage() {
  const value = parseInt(new URL(window.location.href).searchParams.get(PAGE_PARAM) ?? "1", 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function totalPages(summary: string | null) {
  const total = summary?.match(/\d+\s*(?:of|\/)\s*(\d+)/i)?.[1];
  return total == null ? null : parseInt(total, 10);
}

function same(a: PageState | null, b: PageState | null) {
  if (a == null || b == null) {
    return a == b;
  }

  return a.page == b.page && a.summary == b.summary &&
    a.hasPrev == b.hasPrev && a.hasNext == b.hasNext;
}
