export type SpliceSortBy = "relevance" | "popularity" | "recency" | "random";

export type SortOrder = "ASC" | "DESC";

export type SpliceSampleType = "oneshot" | "loop";

/** Whether the BPM filter matches a single tempo or a range of them. */
export type BpmFilterType = "exact" | "range";

export interface BpmFilter {
  minBpm?: number;
  maxBpm?: number;
  bpm?: string;
}

export const MIN_BPM = 1;
export const MAX_BPM = 300;

export type SpliceTag = {
  uuid: string;
  label: string;
}

export type MusicKey = "C" | "C#" | "D" | "D#" | "E" | "F" | "F#" | "G" | "G#" | "A" | "A#" | "B";

export type ChordType = "major" | "minor";

const CHROMATIC: MusicKey[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Returns the relative major/minor of the given key — the key that shares the
 * same set of pitches (e.g. C Major ↔ A Minor). The relative major of a minor
 * key sits a minor third (three semitones) above it, and vice versa.
 */
export function relativeKey(key: MusicKey, chord: ChordType): { key: MusicKey, chord: ChordType } {
  const i = CHROMATIC.indexOf(key);
  const shift = chord == "minor" ? 3 : 9; // +3 semitones up (minor→major), or -3 down (major→minor)
  return {
    key: CHROMATIC[(i + shift) % 12],
    chord: chord == "minor" ? "major" : "minor"
  };
}

