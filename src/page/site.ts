// The only place in Splicedd that knows what splice.com's markup looks like.
//
// Splice annotates its own UI with `data-qa` hooks for its test suite, and they
// are by far the steadiest thing about the page: class names are Svelte build
// hashes that change with every deploy, while these names describe what the
// element is. Everything else here follows from them, and a change to Splice's
// markup is a change to this file alone.

/** Splice's own hooks, exactly as its markup spells them. */
const QA = {
  row: "sampleAssetRow",
  filename: "asset-filename",
  download: "download-button",
  drag: "drag-button",
  perPage: "pagination-per-page-select",
  summary: "pagination-summary",
  prev: "pagination-prev",
  next: "pagination-next"
} as const;

/** What Splice's own paginator falls back to when the page doesn't say. */
const DEFAULT_PER_PAGE = 25;

/** Where a row links to the sample it shows; the last segment is its hash. */
const PERMALINK = 'a[href*="/sounds/sample/"]';

const hook = (name: string) => `[data-qa="${name}"]`;

/** A sample row on splice.com, reduced to what identifies the sample it shows. */
export interface SiteRow {
  element: HTMLElement;

  /** The file name Splice prints on the row, e.g. `SHADOW_UKD_fog_C#.wav`. */
  filename: string;

  /** The content hash in the row's permalink, when the row carries one. */
  hash: string | null;
}

/** The sample row an event happened in, if it happened in one at all. */
export function rowOf(node: EventTarget | null): SiteRow | null {
  const element = elementOf(node)?.closest<HTMLElement>(hook(QA.row));

  if (element == null) {
    return null;
  }

  const filename = element.querySelector(hook(QA.filename))?.textContent?.trim();

  if (filename == null || filename.length == 0) {
    return null;
  }

  return { element, filename, hash: hashOf(element) };
}

/** Which of a row's actions the given node belongs to, if any. */
export function controlOf(node: EventTarget | null): "download" | "drag" | null {
  const element = elementOf(node);

  if (element?.closest(hook(QA.download)) != null) return "download";
  if (element?.closest(hook(QA.drag)) != null) return "drag";

  return null;
}

/** Whether this page is showing a list of samples at all. */
export function hasRows(): boolean {
  return document.querySelector(hook(QA.row)) != null;
}

/** What Splice's own paginator says about where it is, e.g. `Page 3 of 343`. */
export function pageSummary(): string | null {
  return document.querySelector(hook(QA.summary))?.textContent?.trim() ?? null;
}

/**
 * Splice's own previous/next link, when it has one to offer. Following the
 * site's own link keeps its router in charge, so the page changes the way it
 * would have anyway -- no reload, and the same scroll and history behaviour.
 */
export function pageLink(direction: "prev" | "next"): HTMLAnchorElement | null {
  return document.querySelector<HTMLAnchorElement>(`a${hook(QA[direction])}`);
}

/**
 * How many samples the page is showing per page, straight from Splice's own
 * paginator -- the one part of a page's search that isn't in its URL.
 */
export function perPage(): number {
  const select = document.querySelector<HTMLSelectElement>(hook(QA.perPage));
  const value = select == null ? NaN : parseInt(select.value, 10);

  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PER_PAGE;
}

function hashOf(row: HTMLElement) {
  const href = row.querySelector(PERMALINK)?.getAttribute("href");
  const hash = href?.split("/").pop()?.split("?")[0];

  return hash != null && /^[0-9a-f]{16,}$/i.test(hash) ? hash.toLowerCase() : null;
}

function elementOf(node: EventTarget | null): Element | null {
  if (node instanceof Element) return node;
  if (node instanceof Node) return node.parentElement;

  return null;
}

/**
 * Marks a row with what Splicedd is doing to it, which the stylesheet below
 * turns into something the user can see. The attribute is ours; Splice's own
 * rendering is free to drop it, and the next hover puts it back.
 */
export function markRow(row: HTMLElement, state: "loading" | "ready" | null) {
  if (state == null) {
    delete row.dataset.splicedd;
  } else {
    row.dataset.splicedd = state;
  }
}

/**
 * Tints Splice's own download and drag buttons once Splicedd has the file
 * behind them, so it's clear the buttons now do something they didn't before.
 */
export const SITE_STYLES = `
  [data-splicedd] ${hook(QA.download)},
  [data-splicedd] ${hook(QA.drag)} {
    transition: color 0.15s ease, opacity 0.15s ease;
  }

  [data-splicedd="loading"] ${hook(QA.download)},
  [data-splicedd="loading"] ${hook(QA.drag)} {
    opacity: 0.5;
  }

  [data-splicedd="ready"] ${hook(QA.download)},
  [data-splicedd="ready"] ${hook(QA.drag)} {
    color: #7c6cff;
  }
`;
