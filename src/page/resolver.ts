// Names the sample a splice.com row is showing.
//
// Most of the time the tap has already seen it go past and the answer is free.
// It isn't always: Splice renders its result pages on the server, so a page
// opened fresh -- or paginated to -- has rows nobody's `fetch` ever carried.
//
// Those are found in two steps, both only ever taken for a row the user has
// actually reached for. First, on a search page, Splicedd asks Splice the same
// question the page is showing the answer to, which names every row on it at
// once; a row still missing after that (or on a page whose address doesn't say
// what it holds) is looked up by its file name alone. Each step runs once per
// page and once per name, for as long as the answer's URLs are good.

import { SpliceSample, URL_LIFETIME } from "../splice/api";
import { DEFAULT_FILTERS, SampleFilters, SampleSearchResult } from "../splice/search";
import { filtersFromLocation } from "./location";
import { SampleIndex } from "./sampleIndex";
import { SiteRow, isSearchListing, perPage } from "./site";

/** A lookup in flight or already done, and when it was started. */
interface Lookup {
  result: Promise<SampleSearchResult>;
  at: number;
}

export class SampleResolver {
  /** Lookups by what they asked, so nothing is ever asked for twice. */
  private readonly lookups = new Map<string, Lookup>();

  /**
   * @param index What the page has already been sent.
   * @param search Asks Splice for the samples matching a set of filters.
   */
  constructor(
    private readonly index: SampleIndex,
    private readonly search: (filters: SampleFilters) => Promise<SampleSearchResult>
  ) {}

  /**
   * The listing the page's own address describes: how far it runs, and what is
   * on it. Both have to be asked for -- the page doesn't say how it pages, and
   * when it's logged out it doesn't page at all.
   */
  pageResult(): Promise<SampleSearchResult> {
    return this.lookUpPage();
  }

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
    // Only a search page's address says what the page holds; asking it of any
    // other would name the wrong samples and cost a search doing so.
    const lookups = [
      ...(isSearchListing() ? [() => this.lookUpPage()] : []),
      () => this.lookUpName(row.filename)
    ];

    for (const lookup of lookups) {
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
    return this.once(pageKey(), () =>
      this.search(filtersFromLocation(new URL(window.location.href), perPage())));
  }

  private lookUpName(filename: string) {
    return this.once(`name ${filename}`, () =>
      this.search({ ...DEFAULT_FILTERS, query: filename }));
  }

  private once(key: string, run: () => Promise<SampleSearchResult>) {
    const held = this.lookups.get(key);

    // An answer is only as good as the URLs in it.
    if (held != null && Date.now() - held.at < URL_LIFETIME) {
      return held.result;
    }

    const result = run().then(found => {
      this.index.add(found.items);
      return found;
    });

    // A failure isn't an answer, so it isn't remembered as one.
    result.catch(() => {
      if (this.lookups.get(key)?.result == result) {
        this.lookups.delete(key);
      }
    });

    this.lookups.set(key, { result, at: Date.now() });
    return result;
  }
}

/**
 * Everything that decides which samples a listing holds, and nothing that
 * doesn't: two addresses differing only in a scroll anchor are one listing.
 */
function pageKey() {
  const url = new URL(window.location.href);
  return `${url.pathname}?${url.searchParams} x${perPage()}`;
}
