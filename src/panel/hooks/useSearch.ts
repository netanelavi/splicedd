import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_FILTERS, SampleFilters, SampleSearchResult } from "../../splice/search";
import { errorMessage } from "../../chrome/messages";
import { runSearch } from "../search";

export interface Search {
  filters: SampleFilters;

  /** The last successful result, kept on screen while the next one loads. */
  results: SampleSearchResult | null;

  loading: boolean;
  error: string | null;

  /** Changes filters and searches again, returning to the first page. */
  refine: (patch: Partial<SampleFilters>) => void;

  goToPage: (page: number) => void;

  /** Runs the current search again, e.g. to reshuffle a random sort. */
  refresh: () => void;
}

/**
 * Owns the search state: the filters, what they returned, and the request in
 * flight. Every filter change searches again; responses that arrive out of
 * order are discarded.
 */
export function useSearch(initial?: Partial<SampleFilters>): Search {
  const [filters, setFilters] = useState<SampleFilters>({ ...DEFAULT_FILTERS, ...initial });
  const [results, setResults] = useState<SampleSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bumped on every search, so only the newest one may write to the state.
  const generation = useRef(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const request = ++generation.current;

    setLoading(true);

    runSearch(filters).then(
      result => {
        if (request != generation.current)
          return;

        setResults(result);
        setError(null);
        setLoading(false);
      },
      err => {
        if (request != generation.current)
          return;

        setError(errorMessage(err));
        setLoading(false);
      }
    );
  }, [filters, nonce]);

  const refine = useCallback((patch: Partial<SampleFilters>) => {
    // Any change to what is being searched for starts from the first page --
    // page 7 of the previous search means nothing for the new one.
    setFilters(current => ({ ...current, page: 1, ...patch }));
  }, []);

  const goToPage = useCallback((page: number) => {
    setFilters(current => (current.page == page ? current : { ...current, page }));
  }, []);

  const refresh = useCallback(() => setNonce(x => x + 1), []);

  return { filters, results, loading, error, refine, goToPage, refresh };
}
