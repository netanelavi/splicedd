import { PointerEvent as ReactPointerEvent, ReactNode, useEffect, useRef, useState } from "react";
import { Search, Settings, X } from "lucide-react";

import { SpliceSample, SpliceSamplePack } from "../splice/api";
import { DEFAULT_FILTERS, hasActiveFilters } from "../splice/search";
import { assetUrl } from "../chrome/assets";
import { errorMessage } from "../chrome/messages";
import { mutateSettings } from "../chrome/settings";
import { useSettings } from "./useSettings";
import { SampleStore } from "./sampleStore";
import { useSearch } from "./hooks/useSearch";
import { usePlayback } from "./hooks/usePlayback";
import { SampleActions } from "./hooks/useSampleActions";
import { Toasts } from "./hooks/useToasts";
import FilterBar from "./components/FilterBar";
import NowPlaying from "./components/NowPlaying";
import Pagination from "./components/Pagination";
import PackBanner from "./components/PackBanner";
import SampleRow from "./components/SampleRow";
import SettingsView from "./components/SettingsView";
import TagCloud from "./components/TagCloud";
import { Button, IconButton, Spinner } from "./components/primitives";

const MIN_WIDTH = 380;
const MAX_WIDTH = 900;

/** A search asked for from outside the panel, e.g. through the context menu. */
export interface SearchCommand {
  query: string;
  nonce: number;
}

export default function Panel(
  { store, actions, toasts, nowPlaying, command, onClose }: {
    store: SampleStore;
    actions: SampleActions;
    toasts: Toasts;
    nowPlaying: SpliceSample | null;
    command: SearchCommand | null;
    onClose: () => void;
  }
) {
  const settings = useSettings();
  const search = useSearch({ limit: settings.resultsPerPage });
  const playback = usePlayback(store, err => toasts.show(errorMessage(err), { tone: "error" }));

  const [text, setText] = useState("");
  const [pack, setPack] = useState<SpliceSamplePack | null>(null);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const results = search.results;
  const { refine } = search;

  // Typing shouldn't fire a request per keystroke.
  useEffect(() => {
    if (text == search.filters.query)
      return;

    const timer = setTimeout(() => refine({ query: text }), 250);
    return () => clearTimeout(timer);
  }, [text, search.filters.query, refine]);

  useEffect(() => {
    if (command == null)
      return;

    setText(command.query);
    setPack(null);
    refine({ query: command.query, packUuid: undefined, tags: [] });
  }, [command, refine]);

  useEffect(() => {
    if (settings.resultsPerPage != search.filters.limit) {
      refine({ limit: settings.resultsPerPage });
    }
  }, [settings.resultsPerPage, search.filters.limit, refine]);

  const resultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    resultsRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [search.filters.page]);

  const width = useResizableWidth(settings.panelWidth);

  function clearFilters() {
    setText("");
    setPack(null);
    refine({ ...DEFAULT_FILTERS, limit: settings.resultsPerPage });
  }

  return (
    <div className="sd-root" style={{ width: width.value }}>
      <div className="sd-resizer" data-active={width.resizing} onPointerDown={width.startResize} />

      <div className="sd-panel">
        <header className="sd-header">
          <div className="sd-brand">
            <img src={assetUrl("icon-32.png")} alt="" />
            Splicedd
            {results != null && !showSettings &&
              <small>{results.records.toLocaleString()} samples</small>}
          </div>

          <div className="sd-header-actions">
            <IconButton
              label={showSettings ? "Back to search" : "Settings"}
              active={showSettings}
              onClick={() => setShowSettings(x => !x)}
            ><Settings size={17} /></IconButton>

            <IconButton label="Close the panel" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </div>
        </header>

        {showSettings
          ? <SettingsView settings={settings} />
          : <>
              <div className="sd-body">
                <div className="sd-field sd-search">
                  <Search size={16} aria-hidden />
                  <input
                    type="search"
                    aria-label="Search for samples"
                    placeholder="Search for samples..."
                    value={text}
                    onChange={ev => setText(ev.target.value)}
                    onKeyDown={ev => ev.key == "Enter" && refine({ query: text })}
                  />
                  {search.loading && <Spinner />}
                </div>

                <FilterBar filters={search.filters} results={results} onRefine={refine} />

                <TagCloud
                  tags={results?.tags ?? []}
                  selected={search.filters.tags}
                  expanded={tagsExpanded}
                  onToggleTag={tag => refine({
                    tags: search.filters.tags.includes(tag.uuid)
                      ? search.filters.tags.filter(x => x != tag.uuid)
                      : [...search.filters.tags, tag.uuid]
                  })}
                  onToggleExpanded={() => setTagsExpanded(x => !x)}
                />

                {pack != null && <PackBanner pack={pack} onClear={() => {
                  setPack(null);
                  refine({ packUuid: undefined });
                }} />}

                {(hasActiveFilters(search.filters) || search.filters.query.length > 0) &&
                  <div className="sd-row-between">
                    <span className="sd-hint">
                      {search.filters.sort == "random" ? "Randomized results" : "Filtered results"}
                    </span>
                    <Button variant="link" onClick={clearFilters}>Clear filters</Button>
                  </div>}
              </div>

              <div className="sd-results" ref={resultsRef} data-loading={search.loading && results != null}>
                {search.error != null
                  ? <Empty image="blob-think.png" text={search.error}>
                      <Button variant="ghost" onClick={search.refresh}>Try again</Button>
                    </Empty>
                  : results == null
                    ? <Empty image="blob-salute.png" text="Looking for samples..." />
                    : results.items.length == 0
                      ? <Empty image="blob-think.png" text="Nothing matched. Try another query or fewer filters." />
                      : <>
                          {results.items.map(sample => (
                            <SampleRow
                              key={sample.uuid}
                              sample={sample}
                              store={store}
                              playback={playback}
                              actions={actions}
                              onTagClick={tag => !search.filters.tags.includes(tag.uuid) &&
                                refine({ tags: [...search.filters.tags, tag.uuid] })}
                              onPackClick={clicked => {
                                setPack(clicked);
                                refine({ packUuid: clicked.uuid });
                              }}
                            />
                          ))}

                          <Pagination
                            page={results.currentPage}
                            totalPages={results.totalPages}
                            onChange={search.goToPage}
                          />
                        </>}
              </div>
            </>}

        {nowPlaying != null &&
          <NowPlaying sample={nowPlaying} store={store} actions={actions} variant="docked" />}
      </div>
    </div>
  );
}

function Empty(
  { image, text, children }: { image: string; text: string; children?: ReactNode }
) {
  return (
    <div className="sd-empty">
      <img src={assetUrl(image)} alt="" draggable={false} />
      <p>{text}</p>
      {children}
    </div>
  );
}

/** Drag-to-resize for the panel's left edge, persisted once the drag ends. */
function useResizableWidth(initial: number) {
  const [value, setValue] = useState(clampWidth(initial));
  const [resizing, setResizing] = useState(false);
  const latest = useRef(value);

  // A width stored on another tab (or a first load) should still apply here.
  useEffect(() => {
    if (!resizing) {
      setValue(clampWidth(initial));
      latest.current = clampWidth(initial);
    }
  }, [initial, resizing]);

  function startResize(event: ReactPointerEvent) {
    event.preventDefault();
    setResizing(true);

    const onMove = (move: PointerEvent) => {
      latest.current = clampWidth(window.innerWidth - move.clientX);
      setValue(latest.current);
    };

    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);

      setResizing(false);
      void mutateSettings({ panelWidth: latest.current });
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  return { value, resizing, startResize };
}

function clampWidth(width: number) {
  return Math.round(Math.min(Math.max(width, MIN_WIDTH), Math.min(MAX_WIDTH, window.innerWidth - 80)));
}
