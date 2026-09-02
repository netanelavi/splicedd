import { SpliceSortBy, SpliceSampleType, MusicKey, ChordType, SortOrder, SpliceTag } from "./entities";

export const GRAPHQL_URL = "https://surfaces-graphql.splice.com/graphql";

/**
 * How long a sample's pre-signed URLs are trusted for. Splice signs them for a
 * few hours; well inside that, anything older is asked for again rather than
 * found to have expired -- which is what a tab left open overnight would
 * otherwise run into on its first click.
 */
export const URL_LIFETIME = 30 * 60_000;

/**
 * The sample search Splice's own web app runs, kept deliberately identical to
 * theirs: the same operation name, the same filter shape, the same fields. An
 * older shape stops working the moment they retire it, and a request that
 * doesn't look like the site's own is the kind of thing bot management notices.
 *
 * Trimmed only of the inline fragments for asset types this filter can't return
 * (presets, packs, MIDI), since it asks for samples.
 */
const SAMPLES_SEARCH = `query SamplesSearch($attributes: [AssetAttributeSlug!], $parent_asset_uuid: GUID, $query: String, $order: SortOrder = DESC, $sort: AssetSortType = popularity, $random_seed: String, $tags: [ID], $key: String, $chord_type: String, $bpm: String, $min_bpm: Int, $max_bpm: Int, $limit: Int = 50, $asset_category_slug: AssetCategorySlug, $page: Int = 1, $ac_uuid: String, $parent_asset_type: AssetTypeSlug, $licensed: Boolean, $liked: Boolean, $filepath: String, $query_strategy: AssetSearchQueryStrategy, $popularity_weight: Float) {
  assetsSearch(
    filter: {attributes: $attributes, legacy: true, published: true, asset_type_slug: sample, query: $query, filepath: $filepath, tag_ids: $tags, key: $key, chord_type: $chord_type, bpm: $bpm, min_bpm: $min_bpm, max_bpm: $max_bpm, asset_category_slug: $asset_category_slug, ac_uuid: $ac_uuid, licensed: $licensed, liked: $liked, query_strategy: $query_strategy, popularity_weight: $popularity_weight}
    children: {parent_asset_uuid: $parent_asset_uuid}
    pagination: {page: $page, limit: $limit}
    sort: {sort: $sort, order: $order, random_seed: $random_seed}
    legacy: {parent_asset_type: $parent_asset_type}
  ) {
    ...assetDetails
    __typename
  }
}

fragment assetDetails on AssetPage {
  ...assetPageItems
  ...assetTagSummaries
  pagination_metadata {
    currentPage
    totalPages
    __typename
  }
  response_metadata {
    records
    __typename
  }
  __typename
}

fragment assetPageItems on AssetPage {
  items {
    ... on IAsset {
      asset_type_slug
      liked
      licensed
      uuid
      name
      tags {
        uuid
        label
        __typename
      }
      files {
        uuid
        name
        hash
        path
        asset_file_type_slug
        url
        __typename
      }
      __typename
    }
    ... on IAssetChild {
      parents(filter: {asset_type_slug: pack}) {
        items {
          ... on PackAsset {
            permalink_slug
            permalink_base_url
            uuid
            name
            provider {
              permalink_slug
              __typename
            }
            files {
              uuid
              path
              asset_file_type_slug
              url
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    ... on SampleAsset {
      bpm
      chord_type
      key
      duration
      uuid
      name
      asset_category_slug
      catalog_uuid
      attributes
      __typename
    }
    __typename
  }
  __typename
}

fragment assetTagSummaries on AssetPage {
  tag_summary {
    count
    tag {
      uuid
      label
      taxonomy {
        uuid
        name
        __typename
      }
      __typename
    }
    __typename
  }
  __typename
}`;

/**
 * Creates a plain search request, with its only constraint being the search
 * term. Splice's own app sends the term as both the general query and the file
 * path filter, so this does too.
 */
export function createSearchRequest(query: string): SpliceSearchRequest {
  const term = query.trim().length == 0 ? undefined : query;

  return {
    operationName: "SamplesSearch",
    query: SAMPLES_SEARCH,
    variables: {
      attributes: [],
      query: term,
      filepath: term,
      limit: 50,
      page: 1,
      order: "DESC",
      sort: "popularity",
      tags: []
    }
  }
}

/**
 * Represents any GraphQL request to Splice.
 */
export interface SpliceRequest<T> {
  operationName: string;
  query: string;
  variables: T;
}

/**
 * Represents a search GraphQL request to Splice.
 */
export interface SpliceSearchRequest extends SpliceRequest<{
  attributes: string[],
  query?: string,
  filepath?: string,
  bpm?: string,
  max_bpm?: number,
  min_bpm?: number,
  limit: number,
  page: number,
  order: SortOrder,
  sort: SpliceSortBy,
  random_seed?: string,
  tags: string[],
  asset_category_slug?: SpliceSampleType,
  key?: MusicKey,
  chord_type?: ChordType,
  parent_asset_uuid?: string,
  parent_asset_type?: "pack",
  liked?: boolean,
  licensed?: boolean
}>{}

export type SpliceSearchResponse = {
  data: {
    assetsSearch: {
      items: SpliceSample[],
      tag_summary: {
        tag: {
          uuid: string,
          label: string,
          taxonomy: {
            uuid: string;
            name: "Functional Attribute" | "Genre" | "Instrument"
          }
        },
        count: number
      }[],
      response_metadata: {
        records: number
      },
      pagination_metadata: {
        currentPage: number,
        totalPages: number
      }
    }
  }
}

export type SpliceSample = {
  uuid: string,
  name: string,

  /** Splice labels every asset it returns; a sample says so here. */
  asset_type_slug?: "sample",

  tags: SpliceTag[],
  files: SpliceFile[],
  parents: {
    items: SpliceSamplePack[]
  },
  bpm: number | null,
  chord_type: ChordType | null,
  duration: number,
  key: MusicKey | null,
  asset_category_slug: "oneshot" | "loop"
}

export type SpliceFile = {
  name: string,
  path: string,

  /** Content hash of the file, which also identifies it in its download URL. */
  hash?: string,

  asset_file_type_slug: "preview_mp3" | "waveform",

  /**
   * A pre-signed URL, valid for a few hours. It's minted per search response,
   * so it has to be used with the sample it came back with.
   */
  url: string
}

export type SpliceSamplePack = {
  uuid: string,
  name: string,
  permalink_base_url: string,
  files: {
    path: string,
    asset_file_type_slug: "cover_image" | "banner_image" | "demo_mp3" | "preview_mp3",
    url: string
  }[]
}
