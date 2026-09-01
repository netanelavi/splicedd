/**
 * Building the on-disk paths samples are saved under. Shared so the desktop app
 * and the browser extension lay out a sample library the same way.
 */

import { SpliceSample } from "./api";

/** Characters no filesystem (or the Chrome download API) accepts in a path segment. */
const ILLEGAL = /[<>:"|?*\\\x00-\x1F]/g;

/**
 * Makes a single path component safe to write to disk. Spaces become
 * underscores, which keeps sample names usable from a terminal and matches how
 * Splice names its own files.
 */
export function sanitizePathSegment(segment: string) {
  return segment
    .replace(ILLEGAL, "_")
    .replace(/\s/g, "_")
    .replace(/[.\s]+$/, ""); // trailing dots and spaces are invalid on Windows
}

export interface SamplePathOptions {
  /** Replaces the sample's own file extension, e.g. `"wav"`. */
  extension?: string;
}

/**
 * Returns the path a sample belongs at inside a sample library, e.g.
 * `"Concrete_Jungle_Drums/kick_deep.wav"` -- the same layout the desktop app
 * wrote, so a library built by either is one library. Splice sample names can
 * themselves contain directories, which are preserved.
 */
export function samplePath(sample: SpliceSample, options: SamplePathOptions = {}) {
  const { extension } = options;

  const pack = sample.parents?.items?.[0];
  const name = extension == null
    ? sample.name
    : sample.name.replace(/(\.[^./]*)?$/, `.${extension}`);

  return joinPath(...(pack == null ? [] : [pack.name]), ...name.split("/"));
}

/** Joins path segments, making each one safe to write to disk. */
export function joinPath(...segments: string[]) {
  return segments
    .flatMap(segment => segment.split("/"))
    .map(sanitizePathSegment)
    .filter(x => x.length != 0 && x != "." && x != "..")
    .join("/");
}
