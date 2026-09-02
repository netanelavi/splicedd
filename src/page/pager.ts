// Follows the listing splice.com is showing, and turns its pages.
//
// The page says what it shows through its address -- the search, the filters,
// the sort, the page number are all query parameters -- and which rows it is
// showing right now says whose they are: Splice's, drawn on its server, or
// Splicedd's, drawn from Splice's answer to the same address.
//
// Both matter. A new address is a new listing to draw; the old address with
// Splice's own rows back under it means Splice re-rendered the page, which a
// listing Splicedd is responsible for has to be drawn over again.

import { ROW_MARK, hasRows, isSearchListing, rows } from "./site";

export interface PageState {
  /** The address, less anything that doesn't change what the page lists. */
  search: string;

  /** Whether the address says what the page holds, so Splicedd can mirror it. */
  mirrored: boolean;

  /** Whether every row on the page is Splicedd's own. */
  drawn: boolean;
}

export class Pager {
  private readonly listeners = new Set<(state: PageState | null) => void>();
  private current: PageState | null = null;
  private frame = 0;

  /** The current page, or null if the page isn't showing a listing. */
  get state() {
    return this.current;
  }

  /** Starts following the page, and returns the function that stops. */
  start() {
    const observer = new MutationObserver(() => this.schedule());
    observer.observe(document.body, { childList: true, subtree: true });

    const onNavigate = () => this.schedule();
    window.addEventListener("popstate", onNavigate);

    this.read();

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", onNavigate);
      cancelAnimationFrame(this.frame);
    };
  }

  /** Calls back whenever the listing changes, and once now with what it is. */
  onChange(listener: (state: PageState | null) => void) {
    this.listeners.add(listener);
    listener(this.current);

    return () => { this.listeners.delete(listener); };
  }

  /**
   * Moves to another page of the same listing. Splice's router isn't asked to:
   * its server answers a logged-out `?page=` with the first page whatever the
   * number says, so the address is changed here and the listing redrawn from
   * what Splicedd fetches for it.
   */
  readonly open = (href: string) => {
    history.pushState(null, "", href);
    this.schedule();
  };

  private schedule() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.read());
  }

  private read() {
    const next = hasRows() ? state() : null;

    if (same(this.current, next)) {
      return;
    }

    this.current = next;

    for (const listener of this.listeners) {
      listener(next);
    }
  }
}

function state(): PageState {
  const url = new URL(window.location.href);

  return {
    search: `${url.pathname}?${url.searchParams}`,
    mirrored: isSearchListing(),
    drawn: rows().every(row => row.hasAttribute(ROW_MARK))
  };
}

function same(a: PageState | null, b: PageState | null) {
  return a == b ||
    (a != null && b != null && a.search == b.search && a.mirrored == b.mirrored && a.drawn == b.drawn);
}
