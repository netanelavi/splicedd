import { ArrowDownUp, ArrowUpDown, Disc3, Guitar, Layers, Metronome, Music2 } from "lucide-react";

import { ChordType, MusicKey, SortOrder, SpliceSampleType, SpliceSortBy } from "../../splice/entities";
import { SampleFilters, SampleSearchResult, SearchConstraint } from "../../splice/search";
import CheckList from "./CheckList";
import KeyPicker from "./KeyPicker";
import BpmPicker from "./BpmPicker";
import Popover from "./Popover";
import { Select } from "./primitives";

const SORTS: { value: SpliceSortBy; label: string }[] = [
  { value: "relevance", label: "Most relevant" },
  { value: "popularity", label: "Most popular" },
  { value: "recency", label: "Most recent" },
  { value: "random", label: "Random" }
];

const ORDERS: { value: SortOrder; label: string }[] = [
  { value: "DESC", label: "Descending" },
  { value: "ASC", label: "Ascending" }
];

const TYPES: { value: SpliceSampleType | "any"; label: string }[] = [
  { value: "any", label: "Any type" },
  { value: "oneshot", label: "One-shots" },
  { value: "loop", label: "Loops" }
];

const CHORD_LABEL = { major: "Major", minor: "Minor" } as const;

/** Names what a multiple-choice filter is currently narrowing results down to. */
function describe(selected: readonly string[], options: SearchConstraint[], plural: string) {
  const chosen = options.filter(x => selected.includes(x.uuid));

  if (chosen.length == 0)
    return plural;

  return chosen.length == 1 ? chosen[0].name : `${chosen.length} ${plural.toLowerCase()}`;
}

function keyLabel(key: MusicKey | null, chord: ChordType | null) {
  if (key == null && chord == null)
    return "Key";

  return [key?.replace("#", "♯"), chord != null ? CHORD_LABEL[chord] : null]
    .filter(x => x != null)
    .join(" ");
}

function bpmLabel(filters: SampleFilters) {
  if (filters.bpm == null)
    return "BPM";

  return filters.bpmType == "exact"
    ? `${filters.bpm.bpm} BPM`
    : `${filters.bpm.minBpm}-${filters.bpm.maxBpm} BPM`;
}

/** Every filter Splice's sample search understands, in one grid. */
export default function FilterBar(
  { filters, results, onRefine }: {
    filters: SampleFilters;
    results: SampleSearchResult | null;
    onRefine: (patch: Partial<SampleFilters>) => void;
  }
) {
  const instruments = results?.instruments ?? [];
  const genres = results?.genres ?? [];

  const toggleTag = (uuid: string) => onRefine({
    tags: filters.tags.includes(uuid)
      ? filters.tags.filter(x => x != uuid)
      : [...filters.tags, uuid]
  });

  return (
    <div className="sd-filters">
      <Select
        icon={ArrowUpDown} label="Sort by" value={filters.sort} options={SORTS}
        onChange={sort => onRefine({ sort })}
      />

      <Select
        icon={ArrowDownUp} label="Sort order" value={filters.order} options={ORDERS}
        onChange={order => onRefine({ order })}
      />

      <Select
        icon={Layers} label="Sample type" value={filters.sampleType} options={TYPES}
        onChange={sampleType => onRefine({ sampleType })}
      />

      <Popover icon={Guitar} label={describe(filters.tags, instruments, "Instruments")}
        active={instruments.some(x => filters.tags.includes(x.uuid))}
      >
        {() => (
          <CheckList
            options={instruments}
            selected={filters.tags}
            onToggle={toggleTag}
            emptyText="Instruments show up here once a search returns results."
          />
        )}
      </Popover>

      <Popover icon={Disc3} label={describe(filters.tags, genres, "Genres")}
        active={genres.some(x => filters.tags.includes(x.uuid))}
      >
        {() => (
          <CheckList
            options={genres}
            selected={filters.tags}
            onToggle={toggleTag}
            emptyText="Genres show up here once a search returns results."
          />
        )}
      </Popover>

      <Popover icon={Music2} label={keyLabel(filters.key, filters.chord)}
        active={filters.key != null || filters.chord != null}
      >
        {() => (
          <KeyPicker
            musicKey={filters.key}
            chord={filters.chord}
            onChange={(key, chord) => onRefine({ key, chord })}
          />
        )}
      </Popover>

      <Popover icon={Metronome} label={bpmLabel(filters)} active={filters.bpm != null}>
        {close => (
          <BpmPicker
            type={filters.bpmType}
            bpm={filters.bpm}
            onApply={(bpmType, bpm) => { onRefine({ bpmType, bpm }); close(); }}
            onClear={() => { onRefine({ bpm: undefined }); close(); }}
          />
        )}
      </Popover>
    </div>
  );
}
