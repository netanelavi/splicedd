// Reads a splice.com search page's own URL as a set of filters.
//
// Splice names its query parameters after the variables its GraphQL search
// takes -- `filepath`, `tags`, `page` -- so the two line up one for one. That
// makes the page's address enough to ask Splice the same question it just
// asked, which is how the rows of a server-rendered page (the first one, and
// every one paginated to) get named without a request per row.
//
// Anything unrecognised is left out rather than guessed at: a filter Splicedd
// drops only widens the answer, and a row missing from it is still looked up by
// name.

import { ChordType, MusicKey, SortOrder, SpliceSampleType, SpliceSortBy } from "./../splice/entities";
import { DEFAULT_FILTERS, SampleFilters } from "../splice/search";

const SORTS: SpliceSortBy[] = ["relevance", "popularity", "recency", "random"];
const ORDERS: SortOrder[] = ["ASC", "DESC"];
const TYPES: SpliceSampleType[] = ["oneshot", "loop"];
const CHORDS: ChordType[] = ["major", "minor"];
const KEYS: MusicKey[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function filtersFromLocation(url: URL, limit: number): SampleFilters {
  const params = url.searchParams;
  const one = <T extends string>(name: string, allowed: T[]) => {
    const value = params.get(name);
    return value != null && (allowed as string[]).includes(value) ? (value as T) : undefined;
  };

  const bpm = params.get("bpm");
  const minBpm = number(params.get("min_bpm"));
  const maxBpm = number(params.get("max_bpm"));

  return {
    ...DEFAULT_FILTERS,
    query: params.get("filepath") ?? params.get("query") ?? "",
    page: Math.max(number(params.get("page")) ?? 1, 1),
    limit,

    // Splice repeats the parameter for each tag; some of its links comma-join
    // them instead.
    tags: params.getAll("tags").flatMap(value => value.split(",")).filter(x => x.length > 0),

    sort: one("sort", SORTS) ?? DEFAULT_FILTERS.sort,
    order: one("order", ORDERS) ?? DEFAULT_FILTERS.order,
    sampleType: one("asset_category_slug", TYPES) ?? "any",
    key: one("key", KEYS) ?? null,
    chord: one("chord_type", CHORDS) ?? null,

    bpmType: bpm != null ? "exact" : "range",
    bpm: bpm != null
      ? { bpm }
      : minBpm != null || maxBpm != null ? { minBpm, maxBpm } : undefined
  };
}

function number(value: string | null) {
  const parsed = value == null ? NaN : parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
