// The extension-world half of the tap: it turns what splice.com asked the
// network for into something the panel can act on -- an index of every sample
// the page has been sent, and the one it is playing right now.

import { SpliceSample } from "../splice/api";
import { harvestSamples, previewKey } from "../splice/harvest";
import { SampleIndex } from "./sampleIndex";
import { TAP_SOURCE, TapEnvelope } from "./protocol";

export class PageObserver {
  /** Everything the page has been sent, shared with whatever else needs it. */
  readonly index = new SampleIndex();

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
    this.index.clear();
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
      this.harvest(message.body);
    } else {
      this.pending = previewKey(message.url) ?? this.pending;
      this.resolve();
    }
  };

  private harvest(body: string) {
    try {
      this.index.add(harvestSamples(JSON.parse(body)));
    } catch {
      // Not every GraphQL response is a search; some aren't even JSON.
      return;
    }

    // The response naming a sample usually arrives before the page plays it,
    // but replaying one seen on an earlier page happens the other way round.
    this.resolve();
  }

  private resolve() {
    if (this.pending == null) {
      return;
    }

    const sample = this.index.byPreview(this.pending);

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
}
