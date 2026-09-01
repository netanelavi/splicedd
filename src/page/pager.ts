// Follows which listing splice.com is showing, and moves between them.
//
// Splice's server answers a logged-out `?page=` with the first page every time,
// so a page is turned by writing the address into the history and drawing the
// answer -- reloading would only undo it.

import { hasRows, pageSummary } from "./site";

export interface PageState {
  page: number;

  /** Which listing this is: its address, minus anything that doesn't select. */
  search: string;

  /** What the paginator says about where the page is, when there is one. */
  summary: string | null;
}

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

  /** Moves to another page of the same search, without leaving the document. */
  readonly open = (href: string) => {
    window.history.pushState(null, "", href);
    this.schedule();
  };

  /** Splice re-renders in bursts; one read per frame is plenty. */
  readonly schedule = () => {
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
  const url = new URL(window.location.href);
  const page = currentPage();
  const summary = pageSummary();

  return { page, search: `${url.pathname}?${url.searchParams}`, summary };
}

function currentPage() {
  const value = parseInt(new URL(window.location.href).searchParams.get(PAGE_PARAM) ?? "1", 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function same(a: PageState | null, b: PageState | null) {
  if (a == null || b == null) {
    return a == b;
  }

  return a.page == b.page && a.search == b.search && a.summary == b.summary;
}
