import { Download, GripVertical, Volume2 } from "lucide-react";

import { SpliceSample } from "../../splice/api";
import { SampleStore } from "../sampleStore";
import { SampleActions } from "../hooks/useSampleActions";
import { IconButton } from "./primitives";

/**
 * The sample splice.com is playing right now, offered for dragging into a DAW
 * without searching Splicedd for it first -- the user already found it, on
 * Splice's own page.
 *
 * It follows the user: docked at the foot of the panel while that's open, and
 * floating above the launcher while it isn't.
 */
export default function NowPlaying(
  { sample, store, actions, variant }: {
    sample: SpliceSample;
    store: SampleStore;
    actions: SampleActions;
    variant: "docked" | "floating";
  }
) {
  const pack = sample.parents?.items?.[0];

  return (
    <div
      className="sd-now"
      data-variant={variant}
      data-busy={actions.busy.has(sample.uuid)}
      draggable
      title={`${sample.name}\nPlaying on Splice - drag it into your DAW`}
      onPointerEnter={() => store.prefetch(sample)}
      // Rendering takes a moment; starting on mouse-down means the file is
      // usually ready by the time the drag itself begins.
      onPointerDown={() => actions.prepare(sample)}
      onDragStart={event => actions.dragStart(event, sample)}
    >
      <GripVertical size={15} aria-hidden />

      <div className="sd-now-text">
        <span className="sd-now-label"><Volume2 size={12} aria-hidden />Playing on Splice</span>
        <strong>{sample.name.split("/").pop()}</strong>
        {pack != null && <small>{pack.name}</small>}
      </div>

      <div data-no-drag="true">
        <IconButton label="Download the sample" onClick={() => actions.download(sample)}>
          <Download size={16} />
        </IconButton>
      </div>
    </div>
  );
}
