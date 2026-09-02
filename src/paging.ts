/** A gap in a list of page numbers, where the pages between are elided. */
export const GAP = "gap";

/**
 * Page numbers to offer around the current one, with the first and last always
 * present: `1 … 7 8 9 … 343`.
 */
export function pageList(current: number, total: number): (number | typeof GAP)[] {
  const pages: (number | typeof GAP)[] = [];

  for (let page = 1; page <= total; page++) {
    if (page == 1 || page == total || Math.abs(page - current) <= 1) {
      pages.push(page);
    } else if (pages[pages.length - 1] != GAP) {
      pages.push(GAP);
    }
  }

  return pages;
}
