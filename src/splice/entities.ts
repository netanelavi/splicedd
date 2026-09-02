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

export type SpliceTag = {
  uuid: string;
  label: string;
}

export type MusicKey = "C" | "C#" | "D" | "D#" | "E" | "F" | "F#" | "G" | "G#" | "A" | "A#" | "B";

export type ChordType = "major" | "minor";
