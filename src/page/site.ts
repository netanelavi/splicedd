// The only place in Splicedd that knows what splice.com's markup looks like.
//
// Splice annotates its own UI with `data-qa` hooks for its test suite, and they
// are by far the steadiest thing about the page: class names are Svelte build
// hashes that change with every deploy, while these names describe what the
// element is. Everything else here follows from them, and a change to Splice's
// markup is a change to this file alone.

/** Splice's own hooks, exactly as its markup spells them. */
export const QA = {
  row: "sampleAssetRow",
  filename: "asset-filename",
  download: "download-button",
  drag: "drag-button",
  license: "license-button",
  like: "like-button",
  menu: "menu-panel",
  play: "playPausePlaybackButton",
  menuContainer: "menu-container",
  share: "share-button",
  cover: "cover-art-image",
  duration: "asset-duration",
  bpm: "bpm",
  tags: "tags",
  waveform: "sounds.waveform-preview",
  pagination: "pagination",
  page: "pagination-page",
  first: "pagination-first",
  prev: "pagination-prev",
  next: "pagination-next",
  last: "pagination-last",
  perPageLabel: "pagination-per-page",
  perPage: "pagination-per-page-select",
  summary: "pagination-summary"
} as const;

/**
 * Splice's own class names, for the elements Splicedd adds to its page: an
 * added button should be one of Splice's buttons, not a guest in its markup.
 * The `svelte-` names are build hashes and will go stale on a deploy, which is
 * why the injected stylesheet below stands the buttons up on its own.
 */
export const CLASSES = {
  actions: "top-level-action",
  button: "variant-transparent icon-only icon-small",
  icon: "icon svelte-fv3oar",
  hidden: "visually-hidden",
  pagination: "asset-pagination",
  list: "svelte-1iv1had",
  page: "pagination-page svelte-1iv1had",
  current: "current",
  perPage: "pagination-per-page",
  summary: "pagination-summary"
} as const;

/** What Splice's own paginator falls back to when the page doesn't say. */
const DEFAULT_PER_PAGE = 25;

/** Where a row links to the sample it shows; the last segment is its hash. */
const PERMALINK = 'a[href*="/sounds/sample/"]';

export const hook = (name: string) => `[data-qa="${name}"]`;

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

export function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(hook(QA.row))];
}

/**
 * Where a row keeps its buttons. Splice groups them in a form -- it points at
 * the pricing page, which is what its own download button is for -- with the
 * surrounding element as the fallback if that ever stops being true.
 */
export function actionsOf(row: HTMLElement): HTMLElement | null {
  return row.querySelector<HTMLElement>(`.${CLASSES.actions}`) ??
    row.querySelector<HTMLElement>(".asset-actions") ??
    row.querySelector<HTMLElement>(".cell--actions");
}

/** Splice's own paginator, if this page has one. */
export function pagination(): HTMLElement | null {
  return document.querySelector<HTMLElement>(hook(QA.pagination));
}

/**
 * The page a click asks for, when it lands on a paginator Splicedd drew. Those
 * links can't be followed: Splice's server answers a logged-out `?page=` with
 * the first page whatever it says, so the move happens here instead.
 */
export function pageRequestedBy(node: EventTarget | null): string | null {
  const link = elementOf(node)?.closest<HTMLAnchorElement>("a[href]");

  return link != null && link.closest(`[${ADDED}]`) != null ? link.href : null;
}

/**
 * Where a paginator belongs: just above the FAQ that closes every listing --
 * which is exactly where the invitation to register for full access sits on a
 * page that offers no paging at all -- and failing that, after the list.
 */
export function paginationAnchor(): { parent: Element; before: Element | null } | null {
  const marker = document.querySelector("section.faq-section") ??
    document.querySelector(".remaining-results");

  if (marker?.parentElement != null) {
    return { parent: marker.parentElement, before: marker };
  }

  // The end of the list, not the end of the last row: a paginator dropped into
  // a row would land inside a grid that knows nothing about it.
  const all = rows();
  const list = all[all.length - 1]?.parentElement;

  return list?.parentElement == null
    ? null
    : { parent: list.parentElement, before: list.nextElementSibling };
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
 * How many samples the listing is showing per page -- the one part of a page's
 * search that its address doesn't always carry.
 *
 * The reader's own choice comes first, then Splice's paginator if the page has
 * one of its own, and failing both, the rows themselves: a listing that shows
 * ten of them is a listing of ten per page, whatever anything else claims.
 */
export function perPage(): number {
  for (const value of [statedPerPage(), splicesPerPage(), rows().length]) {
    if (value != null && value > 0) {
      return value;
    }
  }

  return DEFAULT_PER_PAGE;
}

function statedPerPage() {
  const stated = new URL(window.location.href).searchParams.get("limit");
  const value = stated == null ? NaN : parseInt(stated, 10);

  return Number.isFinite(value) ? value : null;
}

function splicesPerPage() {
  const select = document.querySelector<HTMLSelectElement>(hook(QA.perPage));

  // Splicedd's own paginator only ever reports the choice already in the
  // address, which is the line above.
  if (select == null || select.closest(`[${ADDED}]`) != null) {
    return null;
  }

  const value = parseInt(select.value, 10);
  return Number.isFinite(value) ? value : null;
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

/** Marks everything Splicedd added, so it can be recognised and replaced. */
export const ADDED = "data-splicedd-added";

/** Marks a row Splicedd drew, which is a copy of one Splice drew. */
export const ROW_MARK = "data-splicedd-row";

/** Marks a row whose sample is already in the library. */
export const HAVE_MARK = "data-splicedd-have";

/** Marks a row picked out for a batch. */
export const PICK_MARK = "data-splicedd-picked";

/** Marks a row whose sample the reader has set aside. */
export const LIKE_MARK = "data-splicedd-liked";

/**
 * The stylesheet Splicedd puts on splice.com.
 *
 * It does three things: stands up the buttons and the paginator Splicedd adds,
 * without depending on Svelte class hashes that go stale on every deploy; tints
 * a row's buttons once the file behind them is ready; and takes down the offers
 * to subscribe, which is a rule rather than a deletion so that turning the
 * setting off puts them straight back.
 */
export const SITE_STYLES = `
  [${ADDED}] {
    background: none;
    border: none;
    padding: 4px;
    color: inherit;
    cursor: pointer;
    transition: color 0.15s ease, opacity 0.15s ease;
  }

  [${ADDED}] svg {
    width: 18px;
    height: 18px;
    display: block;
    fill: currentColor;
  }

  [data-splicedd="loading"] ${hook(QA.download)},
  [data-splicedd="loading"] ${hook(QA.drag)} {
    opacity: 0.5;
  }

  [data-splicedd="ready"] ${hook(QA.download)},
  [data-splicedd="ready"] ${hook(QA.drag)} {
    color: #7c6cff;
  }

  nav[${ADDED}] {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    flex-wrap: wrap;
    margin: 24px 0;
    padding: 0;
  }

  nav[${ADDED}] ul {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  nav[${ADDED}] .${CLASSES.page.split(" ")[0]} {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 32px;
    padding: 0 8px;
    border-radius: 6px;
    color: inherit;
    text-decoration: none;
  }

  nav[${ADDED}] .${CLASSES.current} {
    font-weight: 700;
    text-decoration: underline;
  }

  nav[${ADDED}] [aria-disabled="true"] {
    opacity: 0.35;
    pointer-events: none;
  }

  nav[${ADDED}] select {
    padding: 6px 8px;
    border: 0;
    border-radius: 6px;
    font: inherit;
    color: inherit;
    background: rgba(127, 127, 127, 0.18);
  }

  /*
    What a logged-out page puts where its results and its buttons should be:
    the "+" that licenses a sample with a credit, the "+ N more samples" that
    stands in for the rest of the results with "Register for full access"
    beneath it, and the marketing footer under that.

    The navigation bar and the row menus are left alone -- signing in is how
    the account this all belongs to is reached, and the menu holds more than an
    offer to buy.
  */
  html[data-splicedd-tidy] .${CLASSES.actions} > ${hook(QA.license)},
  html[data-splicedd-tidy] .remaining-results,
  html[data-splicedd-tidy] .button-wrapper:has(use[href="#icon-lock"]),
  html[data-splicedd-tidy] div.footer-container,

  /*
    "Rare Finds" reads like a filter sitting among the filters, but it submits
    a form that opens a blog post. Splicedd's searches constrain nothing, so
    rare finds are in every result already.
  */
  html[data-splicedd-tidy] .rare-finds-wrapper,
  html[data-splicedd-tidy] form#rare-finds-default {
    display: none !important;
  }

  /*
    A sample already on disk, and one picked out for a batch. Both are drawn on
    the row's own edge, where they can't be mistaken for something of Splice's.
  */
  [${HAVE_MARK}] ${hook(QA.download)} {
    color: #55b878;
  }

  /*
    A marked row. The heart is a sprite with its own fill, so colouring the
    button alone can leave nothing to see; the ring behind it is Splicedd's own
    and can't be painted over by whatever the symbol carries.
  */
  [${LIKE_MARK}] ${hook(QA.like)} {
    color: #ff6b8b;
    background: rgba(255, 107, 139, 0.16);
    border-radius: 50%;
  }

  [${LIKE_MARK}] ${hook(QA.like)} svg,
  [${LIKE_MARK}] ${hook(QA.like)} use {
    fill: currentColor;
    stroke: currentColor;
  }

  [${PICK_MARK}] {
    box-shadow: inset 3px 0 0 #7c6cff;
    background: rgba(124, 108, 255, 0.07);
  }

  /* The row playing, on a page Splice's own player knows nothing about. */
  [${ROW_MARK}-playing] ${hook(QA.play)} {
    color: #7c6cff;
  }

  /*
    Splice shows and hides a row's menu from its own code, which a drawn row
    doesn't have. On those rows the menu is shown by an attribute instead.
  */
  [${ROW_MARK}] ${hook(QA.menu)} {
    display: none;
  }

  [${ROW_MARK}] ${hook(QA.menu)}[data-splicedd-open] {
    display: block;
    position: absolute;
    right: 0;
    z-index: 20;
  }

  [${ROW_MARK}] ${hook(QA.menuContainer)} {
    position: relative;
  }
`;

/** Turns the offers to subscribe on or off across the whole page at once. */
export function setUpsellsHidden(hidden: boolean) {
  document.documentElement.toggleAttribute("data-splicedd-tidy", hidden);
}

/**
 * Brings the top of the listing into view. A page turned from the paginator at
 * the foot of a very long list leaves the reader at the foot of it, looking at
 * the FAQ that follows -- which is not where the new page is.
 */
export function showListTop() {
  const list = rows()[0]?.parentElement;

  if (list != null) {
    list.scrollIntoView({ block: "start", behavior: "smooth" });
  }
}

/**
 * Follows the theme Splice's own page is in, and reports it. The panel is a
 * guest here; a light page with a black panel bolted to it looks like a fault.
 */
export function followPageTheme(onTheme: (theme: "dark" | "light") => void) {
  const read = () => onTheme(document.documentElement.dataset.theme == "light" ? "light" : "dark");

  const observer = new MutationObserver(read);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  read();
  return () => observer.disconnect();
}

/**
 * The menu a click asks to open or close, on a row Splicedd drew.
 *
 * Splice's own rows carry Splice's handlers. A copy of one carries its markup
 * and none of its behaviour -- `cloneNode` doesn't clone event listeners -- so
 * the menu on a drawn row has to be opened here or it doesn't open at all.
 */
export function menuToggledBy(node: EventTarget | null): HTMLElement | null {
  const element = elementOf(node);
  const row = element?.closest<HTMLElement>(hook(QA.row));

  if (row == null || !row.hasAttribute(ROW_MARK)) {
    return null;
  }

  const details = element?.closest(`.details, ${hook(QA.menuContainer)}`);
  const inside = element?.closest(hook(QA.menu)) != null;

  // The button that opens it, not anything inside the menu it opened.
  return details == null || inside ? null : row.querySelector<HTMLElement>(hook(QA.menu));
}

/** The row whose heart a click landed on, if it landed on one. */
export function likedBy(node: EventTarget | null): HTMLElement | null {
  const button = elementOf(node)?.closest(hook(QA.like));
  return button?.closest<HTMLElement>(hook(QA.row)) ?? null;
}

export function markLiked(row: HTMLElement, liked: boolean) {
  row.toggleAttribute(LIKE_MARK, liked);
}

/** The row showing the sample with the given id, if it is on this page. */
export function rowFor(uuid: string, rowsOf: (row: HTMLElement) => string | null) {
  return rows().find(row => rowsOf(row) == uuid) ?? null;
}

/** The row whose "copy link" a click landed on, if it landed on one. */
export function sharedBy(node: EventTarget | null): HTMLElement | null {
  const button = elementOf(node)?.closest(hook(QA.share));
  const row = button?.closest<HTMLElement>(hook(QA.row));

  return row?.hasAttribute(ROW_MARK) == true ? row : null;
}

/** Where a row links to the sample it shows. */
export function permalinkOf(row: HTMLElement): string | null {
  return row.querySelector<HTMLAnchorElement>(PERMALINK)?.href ?? null;
}

/** The row whose play button a click landed on, if it landed on one. */
export function playedBy(node: EventTarget | null): HTMLElement | null {
  const button = elementOf(node)?.closest(hook(QA.play));
  return button?.closest<HTMLElement>(hook(QA.row)) ?? null;
}

/** Every row on the page, paired with what identifies the sample it shows. */
export function siteRows(): SiteRow[] {
  return rows().map(element => rowOf(element)).filter(row => row != null);
}

/** Says a row's sample is already on disk, or is no longer. */
export function markLibrary(row: HTMLElement, have: boolean) {
  row.toggleAttribute(HAVE_MARK, have);
}

export function markPicked(row: HTMLElement, picked: boolean) {
  row.toggleAttribute(PICK_MARK, picked);
}

export function pickedRows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[${PICK_MARK}]`)];
}

/** Whether the reader is typing, in which case a bare letter is a letter. */
export function isTyping(node: EventTarget | null) {
  const element = elementOf(node);

  return element?.closest("input, textarea, select, [contenteditable]") != null;
}
