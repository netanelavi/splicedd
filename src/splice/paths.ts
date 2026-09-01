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
  /** Nests the sample in a folder named after the pack it belongs to. Defaults to `true`. */
  organizeByPack?: boolean;

  /** Replaces the sample's own file extension, e.g. `"wav"`. */
  extension?: string;

  /** A folder the whole path is nested under, e.g. `"Splicedd"`. */
  prefix?: string;
}

/**
 * Returns the relative path a sample should be saved under, e.g.
 * `"Splicedd/Concrete_Jungle_Drums/kick_deep.wav"`. Splice sample names can
 * themselves contain directories, which are preserved.
 */
export function samplePath(sample: SpliceSample, options: SamplePathOptions = {}) {
  const { organizeByPack = true, extension, prefix } = options;

  const pack = sample.parents?.items?.[0];
  const name = extension == null
    ? sample.name
    : sample.name.replace(/(\.[^./]*)?$/, `.${extension}`);

  return [
    ...(prefix?.split("/") ?? []),
    ...(organizeByPack && pack != null ? [pack.name] : []),
    ...name.split("/")
  ]
    .map(sanitizePathSegment)
    .filter(x => x.length != 0 && x != "." && x != "..")
    .join("/");
}
