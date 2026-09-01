import { useCallback, useEffect, useRef, useState } from "react";

import { SpliceSample } from "../../splice/api";
import { SampleStore } from "../sampleStore";

export interface Playback {
  /** The sample being played, if any. */
  playing: string | null;

  /** The sample whose preview is still downloading, if any. */
  loading: string | null;

  /** How far into the playing sample we are, from 0 to 1. */
  progress: number;

  toggle: (sample: SpliceSample) => void;

  /** Plays the sample from the given point, from 0 to 1. */
  seek: (sample: SpliceSample, progress: number) => void;
}

/**
 * Plays sample previews through a single audio element, so starting one sample
 * always stops the one before it.
 */
export function usePlayback(store: SampleStore, onError: (err: unknown) => void): Playback {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  audioRef.current ??= new Audio();

  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Guards against a slow preview arriving after the user moved on.
  const generation = useRef(0);

  const stop = useCallback(() => {
    generation.current++;

    const audio = audioRef.current!;
    audio.pause();
    audio.currentTime = 0;

    setPlaying(null);
    setLoading(null);
    setProgress(0);
  }, []);

  const play = useCallback(async (sample: SpliceSample, from: number) => {
    const request = ++generation.current;
    const audio = audioRef.current!;

    audio.pause();
    setPlaying(null);
    setProgress(from);
    setLoading(sample.uuid);

    try {
      const url = await store.preview(sample);
      if (request != generation.current)
        return;

      audio.src = url;

      if (from > 0) {
        await seekTo(audio, from);
        if (request != generation.current)
          return;
      }

      await audio.play();
      if (request != generation.current)
        return;

      setPlaying(sample.uuid);
    } catch (err) {
      if (request == generation.current) {
        onError(err);
      }
    } finally {
      if (request == generation.current) {
        setLoading(null);
      }
    }
  }, [store, onError]);

  const toggle = useCallback((sample: SpliceSample) => {
    if (playing == sample.uuid) {
      stop();
    } else {
      void play(sample, 0);
    }
  }, [playing, play, stop]);

  const seek = useCallback((sample: SpliceSample, target: number) => {
    if (playing != sample.uuid) {
      void play(sample, target);
      return;
    }

    const audio = audioRef.current!;
    audio.currentTime = target * (audio.duration || sample.duration / 1000);
    setProgress(target);
  }, [playing, play]);

  useEffect(() => {
    const audio = audioRef.current!;
    const onEnded = () => stop();

    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [stop]);

  // Keep the waveform's progress marker in step with the audio.
  useEffect(() => {
    if (playing == null)
      return;

    const audio = audioRef.current!;
    let frame = requestAnimationFrame(function tick() {
      setProgress(audio.duration > 0 ? audio.currentTime / audio.duration : 0);
      frame = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(frame);
  }, [playing]);

  // Dragging a sample into a DAW takes the focus away from the browser, and
  // hearing the preview keep playing over the DAW is jarring.
  useEffect(() => {
    window.addEventListener("blur", stop);
    return () => window.removeEventListener("blur", stop);
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { playing, loading, progress, toggle, seek };
}

/** Seeks an element that may not know its own duration yet. */
async function seekTo(audio: HTMLAudioElement, progress: number) {
  if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
    await new Promise<void>(resolve => {
      audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
      audio.addEventListener("error", () => resolve(), { once: true });
    });
  }

  if (audio.duration > 0) {
    audio.currentTime = progress * audio.duration;
  }
}
