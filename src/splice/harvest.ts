/**
 * Reads samples out of a Splice GraphQL response.
 *
 * The walk is shape-driven rather than tied to one query. Splice returns
 * samples from searches, pack pages, "similar sounds" and recommendation rails
 * alike, each under a different path in the response, and a hard-coded path
 * would only ever pick up one of them.
 */

import { SpliceSample } from "./api";

/** Deeper than any response Splice sends; a guard, not a limit. */
const MAX_DEPTH = 12;

/** Every sample a response carries that Splicedd could actually play. */
export function harvestSamples(payload: unknown): SpliceSample[] {
  const found = new Map<string, SpliceSample>();
  collect(payload, 0, found);

  return [...found.values()];
}

function collect(value: unknown, depth: number, found: Map<string, SpliceSample>) {
  if (value == null || typeof value != "object" || depth > MAX_DEPTH) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collect(item, depth + 1, found);
    }

    return;
  }

  // A sample holds packs and tags, but never another sample.
  if (isSample(value)) {
    if (previewUrlOf(value) != null) {
      found.set(value.uuid, value);
    }

    return;
  }

  for (const item of Object.values(value)) {
    collect(item, depth + 1, found);
  }
}

function isSample(value: object): value is SpliceSample {
  const candidate = value as Partial<SpliceSample>;

  return typeof candidate.uuid == "string" &&
    typeof candidate.name == "string" &&
    Array.isArray(candidate.files) &&
    (candidate.asset_type_slug == "sample" ||
      candidate.asset_category_slug == "loop" ||
      candidate.asset_category_slug == "oneshot");
}

/** The pre-signed URL of a sample's preview, when it came with one. */
export function previewUrlOf(sample: SpliceSample): string | undefined {
  return sample.files?.find(x => x.asset_file_type_slug == "preview_mp3")?.url;
}

/**
 * Identifies a preview file across the URLs it's served under. Splice signs a
 * fresh URL into every response; the path it signs stays the same, which is
 * what lets a file the page just requested be matched to the sample it belongs
 * to.
 *
 * Rejecting any other host does double duty: a preview URL only ever reaches
 * Splicedd through a `postMessage` on a page anyone could be running code on,
 * and this is what keeps a forged one from being fetched.
 */
export function previewKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    return isSpliceHost(parsed.hostname) ? parsed.pathname : null;
  } catch {
    return null;
  }
}

/** The hosts Splice serves from, mirroring the manifest's permissions. */
function isSpliceHost(hostname: string) {
  return hostname == "splice.com" ||
    hostname.endsWith(".splice.com") ||
    hostname.endsWith(".amazonaws.com");
}
