/**
 * Maps the filters a user picks in the UI onto Splice's GraphQL search, and
 * normalizes what comes back. Shared by every Splicedd front-end, so a filter
 * behaves identically wherever it's offered.
 */

import { SpliceSample, SpliceSearchRequest, SpliceSearchResponse, createSearchRequest } from "./api";
import {
  BpmFilter, BpmFilterType, ChordType, MusicKey,
  SortOrder, SpliceSampleType, SpliceSortBy, SpliceTag
} from "./entities";

export interface SampleFilters {
  /** Free-text query, matched against the sample's file path. */
  query: string;

  sort: SpliceSortBy;
  order: SortOrder;

  /** Required tag uuids — free tags, instruments and genres alike. */
  tags: string[];

  bpmType: BpmFilterType;
  bpm?: BpmFilter;

  sampleType: SpliceSampleType | "any";

  key: MusicKey | null;
  chord: ChordType | null;

  /** Restricts results to a single pack. */
  packUuid?: string;

  /** One-based page number. */
  page: number;

  /** Results per page. */
  limit?: number;
}

export const DEFAULT_FILTERS: SampleFilters = {
  query: "",
  sort: "popularity",
  order: "DESC",
  tags: [],
  bpmType: "exact",
  sampleType: "any",
  key: null,
  chord: null,
  page: 1
};

/** Whether anything but the free-text query narrows the search down. */
export function hasActiveFilters(filters: SampleFilters) {
  return filters.tags.length != 0 ||
    filters.key != null || filters.chord != null ||
    filters.bpm != null || filters.sampleType != "any" ||
    filters.packUuid != null;
}

/** Builds the GraphQL request that answers the given filters. */
export function buildSearchRequest(filters: SampleFilters): SpliceSearchRequest {
  const request = createSearchRequest(filters.query);
  const variables = request.variables;

  variables.sort = filters.sort;
  variables.order = filters.order;
  variables.tags = [...filters.tags];
  variables.page = filters.page;

  if (filters.limit != null) {
    variables.limit = filters.limit;
  }

  // Without a seed, every page of a random search would be a fresh shuffle,
  // and paging through the results would show the same samples twice.
  if (filters.sort == "random") {
    variables.random_seed = Math.floor(Math.random() * 10_000_000_000).toString();
  }

  if (filters.bpmType == "exact") {
    variables.bpm = filters.bpm?.bpm;
  } else {
    variables.min_bpm = filters.bpm?.minBpm;
    variables.max_bpm = filters.bpm?.maxBpm;
  }

  if (filters.sampleType != "any") {
    variables.asset_category_slug = filters.sampleType;
  }

  variables.key = filters.key ?? undefined;
  variables.chord_type = filters.chord ?? undefined;

  if (filters.packUuid != null) {
    variables.parent_asset_uuid = filters.packUuid;
    variables.parent_asset_type = "pack";
  }

  return request;
}

/** A named constraint the user can filter by, as reported by a search. */
export interface SearchConstraint {
  uuid: string;
  name: string;
}

export interface SampleSearchResult {
  items: SpliceSample[];
  currentPage: number;
  totalPages: number;
  records: number;

  /** Instruments present in the result set, offered as further filters. */
  instruments: SearchConstraint[];

  /** Genres present in the result set, offered as further filters. */
  genres: SearchConstraint[];

  /** Every tag present in the result set, most common first. */
  tags: SpliceTag[];
}

/** Normalizes a raw search response body into the shape the UI renders. */
export function parseSearchResponse(raw: string): SampleSearchResult {
  const response = JSON.parse(raw) as SpliceSearchResponse & {
    errors?: { message: string }[];
  };

  if (response.data?.assetsSearch == null) {
    throw new Error(
      response.errors?.map(x => x.message).join("; ") ?? "Splice returned an empty search response"
    );
  }

  const data = response.data.assetsSearch;

  const constraintsOf = (taxonomy: "Genre" | "Instrument") =>
    data.tag_summary
      .filter(x => x.tag.taxonomy.name == taxonomy)
      .map(x => ({ uuid: x.tag.uuid, name: x.tag.label }));

  const seen = new Set<string>();
  const tags = [...data.tag_summary]
    .sort((a, b) => b.count - a.count)
    .map(x => ({ uuid: x.tag.uuid, label: x.tag.label }))
    .filter(x => !seen.has(x.uuid) && (seen.add(x.uuid), true));

  return {
    items: data.items,
    currentPage: data.pagination_metadata.currentPage,
    totalPages: data.pagination_metadata.totalPages,
    records: data.response_metadata.records,
    instruments: constraintsOf("Instrument"),
    genres: constraintsOf("Genre"),
    tags
  };
}
