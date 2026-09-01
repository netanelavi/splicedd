// Names the sample a splice.com row is showing.
//
// Most of the time the tap has already seen it go past and the answer is free.
// It isn't always: Splice renders its result pages on the server, so a page
// opened fresh -- or paginated to -- has rows nobody's `fetch` ever carried.
//
// Those are found in two steps, both only ever taken for a row the user has
// actually reached for. First Splicedd asks Splice the same question the page
// is showing the answer to, which names every row on it at once; a row still
// missing after that (a page whose filters this doesn't understand) is looked
// up by its file name alone. Each step runs once per page and once per name.

import { SpliceSample } from "../splice/api";
import { DEFAULT_FILTERS, SampleFilters } from "../splice/search";
import { filtersFromLocation } from "./location";
import { SampleIndex } from "./sampleIndex";
import { SiteRow, perPage } from "./site";

export class SampleResolver {
  /** Lookups in flight or already done, so nothing is ever asked for twice. */
  private readonly lookups = new Map<string, Promise<void>>();

  /**
   * @param index What the page has already been sent.
   * @param search Asks Splice for the samples matching a set of filters.
   */
  constructor(
    private readonly index: SampleIndex,
    private readonly search: (filters: SampleFilters) => Promise<readonly SpliceSample[]>
  ) {}

  /**
   * The sample a row shows, if it's already known -- which is all a `dragstart`
   * handler can use, having no chance to await anything.
   */
  peek(row: SiteRow): SpliceSample | null {
    const byHash = row.hash == null ? null : this.index.byHash(row.hash);
    return byHash ?? this.index.byName(row.filename);
  }

  /** The sample a row shows, asking Splice for it if the page never did. */
  async resolve(row: SiteRow): Promise<SpliceSample> {
    for (const lookup of [() => this.lookUpPage(), () => this.lookUpName(row.filename)]) {
      const known = this.peek(row);

      if (known != null) {
        return known;
      }

      await lookup();
    }

    const found = this.peek(row);

    if (found == null) {
      throw new Error(`Splice didn't return "${row.filename}"`);
    }

    return found;
  }

  /** Runs the search the page itself is showing, naming every row on it. */
  private lookUpPage() {
    const url = new URL(window.location.href);

    // Everything that decides which samples this page holds, and nothing that
    // doesn't: two addresses differing only in a scroll anchor are one page.
    const key = `page ${url.pathname}?${url.searchParams} x${perPage()}`;

    return this.once(key, () => this.search(filtersFromLocation(url, perPage())));
  }

  private lookUpName(filename: string) {
    return this.once(`name ${filename}`, () =>
      this.search({ ...DEFAULT_FILTERS, query: filename }));
  }

  private once(key: string, run: () => Promise<readonly SpliceSample[]>) {
    let lookup = this.lookups.get(key);

    if (lookup == null) {
      lookup = run().then(samples => { this.index.add(samples); });

      // A failure isn't an answer, so it isn't remembered as one.
      lookup.catch(() => this.lookups.delete(key));
      this.lookups.set(key, lookup);
    }

    return lookup;
  }
}
