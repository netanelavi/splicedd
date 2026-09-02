// Where the Splice domain meets the extension's transport.

import { GRAPHQL_URL } from "../splice/api";
import { SampleFilters, SampleSearchResult, buildSearchRequest, parseSearchResponse } from "../splice/search";
import { spliceGraphQL } from "../chrome/net";

/** Runs a sample search against Splice and normalizes the response. */
export async function runSearch(filters: SampleFilters): Promise<SampleSearchResult> {
  const request = buildSearchRequest(filters);
  return parseSearchResponse(await spliceGraphQL(GRAPHQL_URL, JSON.stringify(request)));
}
