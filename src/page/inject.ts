// What Splicedd adds to splice.com's own page.
//
// A logged-out Splice row offers a licence button and a heart; there is nothing
// to download with and nothing to drag. A logged-out listing has no paginator
// either -- it ends in an invitation to register instead. So Splicedd puts both
// there: two buttons on every row, in Splice's own markup and using Splice's
// own sprite, and a paginator built from what Splice's API says the search
// actually holds.
//
// Splice re-renders whenever it feels like it, and anything added to its DOM
// will be swept away sooner or later. Nothing here fights that. Everything is
// re-checked after each burst of mutations and put back if it's gone, which
// also covers the page changing underneath entirely.

import { GAP, pageList } from "../paging";
import {
  ADDED, CLASSES, QA, actionsOf, hook, pagination, paginationAnchor, rows
} from "./site";

/** Splice's own sprite, already in the page; the grip is drawn here instead. */
const DOWNLOAD_ICON = `<svg><use href="#icon-file-download"></use></svg>`;

const GRIP_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 5a1.75 1.75 0 1 1-3.5 0A1.75 1.75 0 0 1 9 5zm9.5 0A1.75 1.75 0 1 1 15 5a1.75 1.75 0 0 1 3.5 0zM9 12a1.75 1.75 0 1 1-3.5 0A1.75 1.75 0 0 1 9 12zm9.5 0a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0zM9 19a1.75 1.75 0 1 1-3.5 0A1.75 1.75 0 0 1 9 19zm9.5 0a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0z"/></svg>`;

const CHEVRONS = {
  [QA.first]: "#icon-chevron-circle-left",
  [QA.prev]: "#icon-chevron-left",
  [QA.next]: "#icon-chevron-right",
  [QA.last]: "#icon-chevron-circle-right"
} as const;

const PER_PAGE_CHOICES = [10, 25, 50, 100];

const PAGE_PARAM = "page";

/** What the paginator needs to know, and only Splice's API can say. */
export interface PageCount {
  page: number;
  totalPages: number;
}

export class SiteInjector {
  private frame = 0;
  private counts: PageCount | null = null;

  /**
   * @param onPerPage Told when the reader asks for a different page size.
   * @param onSaveBatch Told to save the page, or whatever is picked out on it.
   */
  constructor(
    private readonly onPerPage: (perPage: number) => void,
    private readonly onSaveBatch: () => void
  ) {}

  /** Starts keeping the page edited, and returns the function that stops it. */
  start() {
    const observer = new MutationObserver(() => this.schedule());
    observer.observe(document.body, { childList: true, subtree: true });

    this.apply();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(this.frame);

      for (const added of document.querySelectorAll(`[${ADDED}]`)) {
        added.remove();
      }
    };
  }

  /** Re-draws the paginator, once the page count behind it has changed. */
  refresh(counts: PageCount | null) {
    this.counts = counts;

    const drawn = pagination();

    if (drawn?.hasAttribute(ADDED) == true) {
      drawn.remove();
    }

    this.schedule();
  }

  /** Splice re-renders in bursts; one pass per frame is plenty. */
  private schedule() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.apply());
  }

  private apply() {
    for (const row of rows()) {
      this.addButtons(row);
    }

    this.addPagination();
  }

  private addButtons(row: HTMLElement) {
    const actions = actionsOf(row);

    // A subscriber's row already has both, and Splice's own are the ones that
    // reach the licensed file.
    if (actions == null || actions.querySelector(hook(QA.download)) != null) {
      return;
    }

    actions.prepend(
      button(QA.download, "Download", DOWNLOAD_ICON),
      button(QA.drag, "Drag to DAW", GRIP_ICON)
    );
  }

  private addPagination() {
    if (this.counts == null || pagination() != null) {
      return;
    }

    const anchor = paginationAnchor();

    if (anchor != null) {
      anchor.parent.insertBefore(this.paginator(this.counts), anchor.before);
    }
  }

  private paginator({ page, totalPages }: PageCount) {
    const nav = create("nav", CLASSES.pagination, QA.pagination);
    nav.setAttribute(ADDED, "");
    nav.setAttribute("role", "navigation");
    nav.setAttribute("aria-label", "Pagination");

    const list = create("ul", CLASSES.list);

    list.append(
      item(step(QA.first, "First page", page > 1 ? 1 : null)),
      item(step(QA.prev, "Previous page", page > 1 ? page - 1 : null))
    );

    for (const entry of pageList(page, totalPages)) {
      list.append(item(entry == GAP ? gap() : number(entry, page)));
    }

    list.append(
      item(step(QA.next, "Next page", page < totalPages ? page + 1 : null)),
      item(step(QA.last, "Last page", page < totalPages ? totalPages : null))
    );

    nav.append(list, this.perPage(), summary(page, totalPages), this.batch());
    return nav;
  }

  /**
   * Saving a whole page at once. Splice's listing has nowhere to put such a
   * thing, so it goes beside the paginator Splicedd already draws -- which is
   * also where "this page" means something.
   */
  private batch() {
    const button = create("button", CLASSES.page) as HTMLButtonElement;

    button.type = "button";
    button.textContent = "Save this page";
    button.title = "Saves every sample on this page, or just the ones picked out with x";
    button.setAttribute(ADDED, "");
    button.addEventListener("click", () => this.onSaveBatch());

    return button;
  }

  private perPage() {
    const label = create("label", CLASSES.perPage, QA.perPageLabel);
    const select = create("select", "", QA.perPage) as HTMLSelectElement;

    for (const choice of PER_PAGE_CHOICES) {
      const option = document.createElement("option");

      option.value = choice.toString();
      option.textContent = choice.toString();
      select.append(option);
    }

    select.value = currentPerPage().toString();
    select.addEventListener("change", () => this.onPerPage(parseInt(select.value, 10)));

    label.append(text("span", "Per page"), select);
    return label;
  }
}

/** One of the two buttons Splicedd adds to a row, in Splice's own clothing. */
function button(name: string, label: string, icon: string) {
  const element = create("button", CLASSES.button, name) as HTMLButtonElement;

  element.type = "button";
  element.draggable = true;
  element.title = label;
  element.setAttribute(ADDED, "");

  const wrapper = create("span", CLASSES.icon);
  wrapper.innerHTML = icon;

  element.append(wrapper, text("span", label, CLASSES.hidden));
  return element;
}

/** A first/previous/next/last control, or its disabled stand-in. */
function step(name: keyof typeof CHEVRONS, label: string, page: number | null) {
  const element = pageControl(name, page);
  const icon = create("span", CLASSES.icon);

  icon.innerHTML = `<svg><use href="${CHEVRONS[name]}"></use></svg>`;
  element.append(icon, text("span", label, CLASSES.hidden));

  return element;
}

function number(page: number, current: number) {
  if (page == current) {
    const element = create("span", `${CLASSES.page} ${CLASSES.current}`);

    element.setAttribute("aria-current", "page");
    element.textContent = page.toString();

    return element;
  }

  const element = pageControl(QA.page, page);
  element.textContent = page.toString();

  return element;
}

/**
 * A link to a page of the same search, which is what Splice's own paginator
 * offers: an address its router already knows how to follow.
 */
function pageControl(name: string, page: number | null) {
  if (page == null) {
    const disabled = create("span", CLASSES.page, name);
    disabled.setAttribute("aria-disabled", "true");

    return disabled;
  }

  const link = create("a", CLASSES.page, name) as HTMLAnchorElement;
  const url = new URL(window.location.href);

  url.searchParams.set(PAGE_PARAM, page.toString());
  link.href = url.pathname + url.search;
  link.setAttribute("aria-label", `Page ${page}`);

  return link;
}

function gap() {
  const element = create("span", CLASSES.page);

  element.setAttribute("aria-hidden", "true");
  element.textContent = "…";

  return element;
}

function summary(page: number, totalPages: number) {
  return text("span", `Page ${page} of ${totalPages}`, CLASSES.summary, QA.summary);
}

function currentPerPage() {
  const stated = new URL(window.location.href).searchParams.get("limit");
  const value = stated == null ? NaN : parseInt(stated, 10);

  return PER_PAGE_CHOICES.includes(value) ? value : PER_PAGE_CHOICES[1];
}

function item(child: Element) {
  const element = create("li", CLASSES.list);
  element.append(child);

  return element;
}

function create(tag: string, className = "", qa?: string) {
  const element = document.createElement(tag);

  if (className.length > 0) element.className = className;
  if (qa != null) element.dataset.qa = qa;

  return element;
}

function text(tag: string, content: string, className = "", qa?: string) {
  const element = create(tag, className, qa);
  element.textContent = content;

  return element;
}
