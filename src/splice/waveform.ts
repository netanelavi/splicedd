/**
 * Geometry for the waveform previews Splice serves alongside every sample (a
 * JSON array of normalized amplitudes).
 */

/** The flat line shown in place of a waveform that hasn't loaded yet. */
export const EMPTY_WAVEFORM: number[] = new Array(64).fill(0);

/** The view box every path returned by {@link waveformPath} is drawn in. */
export const WAVEFORM_VIEW_BOX = { width: 1000, height: 200 };

/** Builds an SVG path that mirrors the given amplitudes around the horizontal axis. */
export function waveformPath(data: number[]) {
  const { width, height } = WAVEFORM_VIEW_BOX;
  const midHeight = height / 2;
  const step = width / data.length;

  const path = [`M 0 ${midHeight}`];

  // Top half of the waveform...
  for (let i = 0; i < data.length; i++) {
    path.push(`L ${(i * step).toFixed(2)} ${(midHeight - (data[i] * midHeight)).toFixed(2)}`);
  }

  // ...and the bottom half, mirrored.
  for (let i = data.length - 1; i >= 0; i--) {
    path.push(`L ${(i * step).toFixed(2)} ${(midHeight + (data[i] * midHeight)).toFixed(2)}`);
  }

  path.push("Z");
  return path.join(" ");
}
