import { useEffect, useId, useRef, useState } from "react";

import { EMPTY_WAVEFORM, WAVEFORM_VIEW_BOX, waveformPath } from "../../splice/waveform";
import { fetchJson } from "../../chrome/net";

/**
 * The amplitude preview Splice serves alongside a sample. Doubles as the seek
 * bar during playback: the played part is drawn in the accent color.
 */
export default function Waveform(
  { src, progress, onSeek }: {
    src: string;

    /** Playback progress, from 0 to 1. */
    progress: number;

    onSeek: (progress: number) => void;
  }
) {
  const gradientId = `sd-wave-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const container = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<number[] | null>(null);

  // Search results are long; a waveform is only worth fetching once its row is
  // actually on screen.
  useEffect(() => {
    let cancelled = false;
    setData(null);

    const observer = new IntersectionObserver(entries => {
      if (!entries.some(x => x.isIntersecting))
        return;

      observer.disconnect();

      fetchJson<number[]>(src).then(
        waveform => { if (!cancelled) setData(waveform); },
        err => console.warn("[splicedd] couldn't load a waveform:", err)
      );
    });

    observer.observe(container.current!);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [src]);

  function seekTo(clientX: number, element: HTMLElement) {
    const bounds = element.getBoundingClientRect();
    onSeek(Math.min(Math.max((clientX - bounds.left) / bounds.width, 0), 1));
  }

  return (
    <div
      ref={container}
      className="sd-waveform"
      role="slider"
      tabIndex={0}
      aria-label="Seek within the sample"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={progress}
      draggable={false}
      onClick={ev => seekTo(ev.clientX, ev.currentTarget)}
      onKeyDown={ev => {
        if (ev.key != "ArrowLeft" && ev.key != "ArrowRight")
          return;

        ev.preventDefault();
        onSeek(Math.min(Math.max(progress + (ev.key == "ArrowLeft" ? -0.05 : 0.05), 0), 1));
      }}
    >
      <svg
        viewBox={`0 0 ${WAVEFORM_VIEW_BOX.width} ${WAVEFORM_VIEW_BOX.height}`}
        preserveAspectRatio="none"
        data-loaded={data != null}
        aria-hidden
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset={`${progress * 100}%`} stopColor="var(--sd-accent)" />
            <stop offset={`${progress * 100}%`} stopColor="var(--sd-muted)" />
          </linearGradient>
        </defs>
        <path d={waveformPath(data ?? EMPTY_WAVEFORM)} fill={`url(#${gradientId})`} />
      </svg>
    </div>
  );
}
