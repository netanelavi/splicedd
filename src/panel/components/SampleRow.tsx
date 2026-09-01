import { Clock, Download, Metronome, Music2, Play, Repeat, Square } from "lucide-react";

import { SpliceSample, SpliceSamplePack } from "../../splice/api";
import { SpliceTag } from "../../splice/entities";
import { assetUrl } from "../../chrome/assets";
import { SampleStore } from "../sampleStore";
import { Playback } from "../hooks/usePlayback";
import { SampleActions } from "../hooks/useSampleActions";
import { IconButton, Spinner } from "./primitives";
import Waveform from "./Waveform";

const CHORD_LABEL = { major: "Major", minor: "Minor" } as const;

export default function SampleRow(
  { sample, store, playback, actions, onTagClick, onPackClick }: {
    sample: SpliceSample;
    store: SampleStore;
    playback: Playback;
    actions: SampleActions;
    onTagClick: (tag: SpliceTag) => void;
    onPackClick: (pack: SpliceSamplePack) => void;
  }
) {
  const pack = sample.parents?.items?.[0];
  const cover = pack?.files.find(x => x.asset_file_type_slug == "cover_image")?.url
    ?? assetUrl("missing-cover.png");

  const waveform = sample.files.find(x => x.asset_file_type_slug == "waveform")?.url;

  const playing = playback.playing == sample.uuid;
  const loadingPreview = playback.loading == sample.uuid;

  // Only the row's cursor reacts to a file being prepared. Swapping a button's
  // icon while the mouse is down would detach the node the click began on, and
  // Chromium then never delivers the click.
  const preparing = actions.busy.has(sample.uuid) || loadingPreview;

  return (
    <div
      className="sd-sample"
      data-busy={preparing}
      draggable
      title={`${sample.name}\nDrag into your DAW, or use the download button`}
      onPointerEnter={() => store.prefetch(sample)}
      // Rendering the file takes a moment; starting on mouse-down means it's
      // usually ready by the time the drag actually begins.
      onPointerDown={() => actions.prepare(sample)}
      onDragStart={event => {
        const overControl = event.nativeEvent
          .composedPath()
          .some(node => node instanceof HTMLElement && node.dataset.noDrag == "true");

        if (overControl) {
          event.preventDefault();
          return;
        }

        actions.dragStart(event, sample);
      }}
    >
      <button
        type="button"
        className="sd-sample-cover"
        data-no-drag="true"
        title={pack != null ? `Show samples from ${pack.name}` : undefined}
        aria-label={pack != null ? `Show samples from ${pack.name}` : "Sample cover"}
        disabled={pack == null}
        onClick={() => pack != null && onPackClick(pack)}
      >
        <img src={cover} alt="" draggable={false} />
      </button>

      <div data-no-drag="true">
        <IconButton
          label={playing ? "Stop" : "Play"}
          active={playing}
          onClick={() => playback.toggle(sample)}
        >
          {loadingPreview
            ? <Spinner size={16} />
            : playing
              ? <Square size={15} fill="currentColor" />
              : <Play size={15} fill="currentColor" />}
        </IconButton>
      </div>

      <div className="sd-sample-main">
        <span className="sd-sample-name">{sample.name.split("/").pop()}</span>

        <div className="sd-sample-meta">
          <span title={sample.asset_category_slug == "loop" ? "Loop" : "One-shot"}>
            {sample.asset_category_slug == "loop"
              ? <Repeat size={12} aria-hidden />
              : <Music2 size={12} aria-hidden />}
            {sample.key != null
              ? `${sample.key}${sample.chord_type != null ? ` ${CHORD_LABEL[sample.chord_type]}` : ""}`
              : sample.asset_category_slug == "loop" ? "Loop" : "One-shot"}
          </span>

          {sample.bpm != null &&
            <span title="Tempo"><Metronome size={12} aria-hidden />{sample.bpm} BPM</span>}

          <span title="Duration">
            <Clock size={12} aria-hidden />{(sample.duration / 1000).toFixed(2)}s
          </span>

          {sample.tags.slice(0, 2).map(tag => (
            <button
              key={tag.uuid}
              type="button"
              className="sd-tag"
              data-no-drag="true"
              onClick={() => onTagClick(tag)}
            >{tag.label}</button>
          ))}
        </div>

        {waveform != null &&
          <div data-no-drag="true">
            <Waveform
              src={waveform}
              progress={playing ? playback.progress : 0}
              onSeek={progress => playback.seek(sample, progress)}
            />
          </div>}
      </div>

      <div className="sd-sample-actions" data-no-drag="true">
        <IconButton label="Download the sample" onClick={() => actions.download(sample)}>
          <Download size={16} />
        </IconButton>
      </div>
    </div>
  );
}
