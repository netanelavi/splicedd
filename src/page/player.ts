// Previews a sample from splice.com's own play button.
//
// Splice's player knows about the rows Splice drew. Every row is Splicedd's
// now, so this is the player: one element, one sample at a time, reporting
// where it has got to so the row's waveform can follow it.

import { ROW_MARK } from "./site";

export class SitePlayer {
  private readonly audio = new Audio();

  private row: HTMLElement | null = null;
  private frame = 0;

  /** @param onProgress Told how far through the row is, many times a second. */
  constructor(private readonly onProgress: (row: HTMLElement, progress: number) => void) {
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

    try {
      const url = await preview();

      // Long enough to fetch and unscramble that the reader may have moved on.
      if (this.row != row) {
        return;
      }

      this.audio.src = url;
      await this.audio.play();
    } catch (err) {
      // Nothing is playing, so nothing should say it is -- or the next press
      // on the row would "stop" it instead of trying again.
      if (this.row == row) {
        this.stop();
      }

      throw err;
    }

    this.follow();
  }

  /** Moves to a point in the sample, as a fraction of its length. */
  seek(row: HTMLElement, progress: number) {
    if (!this.playing(row) || !Number.isFinite(this.audio.duration)) {
      return;
    }

    this.audio.currentTime = Math.min(Math.max(progress, 0), 1) * this.audio.duration;
    this.report();
  }

  /** Moves along the sample by a fraction of its length, in either direction. */
  nudge(row: HTMLElement, by: number) {
    if (this.playing(row) && Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
      this.seek(row, this.audio.currentTime / this.audio.duration + by);
    }
  }

  stop() {
    this.audio.pause();
    cancelAnimationFrame(this.frame);

    if (this.row != null) {
      this.onProgress(this.row, 0);
      this.mark(this.row, false);
    }
  }

  dispose() {
    this.stop();
    this.audio.src = "";
  }

  /**
   * Reports on every frame rather than on the element's own `timeupdate`, which
   * fires about four times a second -- often enough to know where the sound is,
   * far too rarely for the waveform to look like it is moving.
   */
  private follow() {
    cancelAnimationFrame(this.frame);

    const tick = () => {
      if (this.row == null || this.audio.paused) {
        return;
      }

      this.report();
      this.frame = requestAnimationFrame(tick);
    };

    tick();
  }

  private report() {
    if (this.row != null && Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
      this.onProgress(this.row, this.audio.currentTime / this.audio.duration);
    }
  }

  private mark(row: HTMLElement, playing: boolean) {
    this.row = playing ? row : null;
    row.toggleAttribute(`${ROW_MARK}-playing`, playing);
  }
}
