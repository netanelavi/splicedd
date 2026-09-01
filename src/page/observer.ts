// The extension-world half of the tap: it turns what splice.com asked the
// network for into the one thing the panel can act on -- the sample the page is
// playing right now, with the pre-signed preview URL Splice minted for it.
//
// Samples are indexed by their preview file rather than their uuid, because a
// preview request is all the page reveals about what it started playing.

import { SpliceSample } from "../splice/api";
import { harvestSamples, previewKey, previewUrlOf } from "../splice/harvest";
import { TAP_SOURCE, TapEnvelope } from "./protocol";

/** How many samples to remember, so a long browse can't grow without bound. */
const INDEX_LIMIT = 500;

export class PageObserver {
  /** Samples seen so far, keyed by the preview file each one plays. */
  private readonly samples = new Map<string, SpliceSample>();

  private readonly listeners = new Set<() => void>();

  private playing: SpliceSample | null = null;

  /** The preview the page last asked for, until the sample behind it is known. */
  private pending: string | null = null;

  /** Starts watching, and returns the function that stops it. */
  start() {
    window.addEventListener("message", this.receive);
    return () => this.stop();
  }

  stop() {
    window.removeEventListener("message", this.receive);

    this.listeners.clear();
    this.samples.clear();
    this.playing = null;
    this.pending = null;
  }

  /** The sample splice.com's own player is playing, if it can be named. */
  readonly nowPlaying = () => this.playing;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private readonly receive = (event: MessageEvent) => {
    // Only this page's tap: anything can post to this window.
    if (event.source != window) {
      return;
    }

    const message = event.data as TapEnvelope | null;

    if (message?.source != TAP_SOURCE) {
      return;
    }

    if (message.kind == "graphql") {
      this.index(message.body);
    } else {
      this.pending = previewKey(message.url) ?? this.pending;
      this.resolve();
    }
  };

  private index(body: string) {
    let samples: SpliceSample[];

    try {
      samples = harvestSamples(JSON.parse(body));
    } catch {
      // Not every GraphQL response is a search; some aren't even JSON.
      return;
    }

    for (const sample of samples) {
      const key = previewKey(previewUrlOf(sample)!);

      if (key != null) {
        // Re-inserting keeps the freshest signature, and the newest place in
        // the queue the overflow is evicted from.
        this.samples.delete(key);
        this.samples.set(key, sample);
      }
    }

    this.evictOverflow();

    // The response naming a sample usually arrives before the page plays it,
    // but replaying one seen on an earlier page happens the other way round.
    this.resolve();
  }

  private resolve() {
    if (this.pending == null) {
      return;
    }

    const sample = this.samples.get(this.pending);

    if (sample == null) {
      return;
    }

    this.pending = null;

    if (sample != this.playing) {
      this.playing = sample;

      for (const listener of this.listeners) {
        listener();
      }
    }
  }

  private evictOverflow() {
    for (const key of this.samples.keys()) {
      if (this.samples.size <= INDEX_LIMIT)
        return;

      this.samples.delete(key);
    }
  }
}
