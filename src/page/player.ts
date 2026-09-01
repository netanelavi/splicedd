// Previews a sample from splice.com's own play button.
//
// Splice's player knows about the rows Splice drew. On a page Splicedd drew it
// has nothing to play, so this answers those rows instead -- one element, one
// sample at a time, which is how the site behaves anyway.

import { ROW_MARK } from "./site";

export class SitePlayer {
  private readonly audio = new Audio();

  private row: HTMLElement | null = null;

  constructor() {
    this.audio.addEventListener("ended", () => this.stop());
  }

  /** Whether the given row is the one playing. */
  playing(row: HTMLElement) {
    return this.row == row;
  }

  /** Starts a row's sample, or stops it if it's the one already playing. */
  async toggle(row: HTMLElement, preview: () => Promise<string>) {
    if (this.playing(row)) {
      this.stop();
      return;
    }

    this.stop();
    this.mark(row, true);

    const url = await preview();

    // Long enough to fetch and unscramble that the reader may have moved on.
    if (this.row != row) {
      return;
    }

    this.audio.src = url;
    await this.audio.play();
  }

  stop() {
    this.audio.pause();

    if (this.row != null) {
      this.mark(this.row, false);
    }
  }

  dispose() {
    this.stop();
    this.audio.src = "";
  }

  private mark(row: HTMLElement, playing: boolean) {
    this.row = playing ? row : null;
    row.toggleAttribute(`${ROW_MARK}-playing`, playing);
  }
}
