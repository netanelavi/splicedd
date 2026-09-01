// Draws splice.com's result list, for the pages Splice won't draw itself.
//
// A logged-out search returns one page and stops; asking for `?page=2` gets the
// first page back again. So Splicedd runs the search and puts the results on
// the page -- but it doesn't invent a row to put them in. It takes a row Splice
// drew, keeps it as a template, and refills a copy of it per sample.
//
// That is deliberately the least work that can be done: the markup, the classes
// and the styling are Splice's own, so a rendered page is indistinguishable
// from a real one and stays that way through a redesign. Only the values are
// ours to write, and every one of them is named by a `data-qa` hook.

import { SpliceSample, SpliceSamplePack } from "../splice/api";
import { CLASSES, QA, ROW_MARK, hook, rows } from "./site";

/** Where a tag on a row links: the same search, narrowed to that tag. */
const TAG_PARAM = "tags";

/** How Splice's own waveform is drawn: thin bars with a hair between them. */
const BAR_WIDTH = 2;
const BAR_GAP = 1;
const MIN_BAR = 1;

/** How much of the waveform the part still to play is drawn at. */
const AHEAD_ALPHA = 0.4;

/**
 * The waveform behind each canvas, so it can be drawn again at a new position
 * without being fetched again. Weak, so a row that goes away takes its data
 * with it.
 */
const drawn = new WeakMap<HTMLCanvasElement, number[]>();

export class RowList {
  /** A row Splice drew, kept to make more of them. */
  private template: HTMLElement | null = null;

  private container: HTMLElement | null = null;

  /**
   * @param waveform Reads the waveform Splice publishes for a sample.
   */
  constructor(private readonly waveform: (url: string) => Promise<number[]>) {}

  /**
   * Remembers what one of Splice's own rows looks like. Called whenever the
   * page changes, and keeps the first answer: once the list is Splicedd's, the
   * rows in it are copies and copying a copy would drift.
   */
  learn() {
    if (this.template != null) {
      return;
    }

    const row = rows().find(x => !x.hasAttribute(ROW_MARK));

    if (row != null) {
      this.template = row.cloneNode(true) as HTMLElement;
      this.container = row.parentElement;
    }
  }

  /**
   * Whether the listing on screen is already this one, drawn by Splicedd. A
   * page Splice served happens to hold the same samples, but not the behaviour
   * that goes with them, so it is still replaced.
   */
  owns(samples: readonly SpliceSample[]) {
    const drawn = rows();

    return drawn.length == samples.length && drawn.every((row, index) =>
      row.hasAttribute(ROW_MARK) &&
      row.querySelector(hook(QA.filename))?.textContent?.trim() == fileOf(samples[index].name));
  }

  /** Replaces the listing with the given samples. */
  show(samples: readonly SpliceSample[]) {
    this.learn();

    if (this.template == null || this.container == null || samples.length == 0) {
      return;
    }

    const drawn = samples.map(sample => this.draw(sample));
    const existing = rows();

    // Put the first row where the first row was, so anything the list wraps
    // its rows in is left where it stands.
    existing[0]?.before(...drawn);

    for (const row of existing) {
      row.remove();
    }
  }

  private draw(sample: SpliceSample) {
    const row = this.template!.cloneNode(true) as HTMLElement;
    row.setAttribute(ROW_MARK, "");

    const pack = sample.parents?.items?.[0];

    text(row, QA.filename, fileOf(sample.name));
    text(row, QA.duration, duration(sample.duration));
    text(row, QA.bpm, sample.bpm == null ? "--" : sample.bpm.toString());

    key(row, sample);
    cover(row, pack);
    permalink(row, sample);
    tags(row, sample);
    this.drawWaveform(row, sample);

    // The play button belongs to Splice's player, which knows nothing about a
    // row Splicedd drew; the site listener answers it instead.
    row.querySelector(hook(QA.play))?.removeAttribute("disabled");

    return row;
  }

  /**
   * Fills in the waveform Splice would have drawn, on the canvas Splice put
   * there -- same element, same size, same styling. Replacing it with something
   * of Splicedd's own is what made a drawn page look like someone else's.
   */
  private drawWaveform(row: HTMLElement, sample: SpliceSample) {
    const canvas = row.querySelector<HTMLCanvasElement>(`${hook(QA.waveform)} canvas`);
    const url = sample.files.find(x => x.asset_file_type_slug == "waveform")?.url;

    if (canvas == null || url == null) {
      return;
    }

    this.waveform(url).then(data => {
      drawn.set(canvas, data);
      paintWaveform(canvas, data, 0);
    }, () => {});
  }
}

function key(row: HTMLElement, sample: SpliceSample) {
  // The key has no hook of its own; it is the metadata cell between the two
  // that do, which is what its column index says.
  const cell = row.querySelector(`[aria-colindex="6"]`);

  if (cell != null) {
    cell.textContent = sample.key == null
      ? "--"
      : `${sample.key}${sample.chord_type == "minor" ? "m" : ""}`;
  }
}

function cover(row: HTMLElement, pack: SpliceSamplePack | undefined) {
  const image = row.querySelector<HTMLImageElement>(hook(QA.cover));
  const url = pack?.files.find(x => x.asset_file_type_slug == "cover_image")?.url;

  if (image != null && url != null) {
    image.src = url;
    image.removeAttribute("srcset");
  }

  const link = row.querySelector<HTMLAnchorElement>("a.pack-art");

  if (link != null && pack != null) {
    link.href = pack.permalink_base_url;
  }
}

/** The row's link to the sample, which is also how the row is identified. */
function permalink(row: HTMLElement, sample: SpliceSample) {
  const link = row.querySelector<HTMLAnchorElement>('a[href*="/sounds/sample/"]');
  const hash = sample.files.find(x => x.asset_file_type_slug == "preview_mp3")?.hash;

  if (link != null && hash != null) {
    link.href = `https://splice.com/sounds/sample/${hash}`;
  } else {
    link?.remove();
  }
}

function tags(row: HTMLElement, sample: SpliceSample) {
  const list = row.querySelector(hook(QA.tags));
  const template = list?.querySelector("a");

  if (list == null || template == null) {
    return;
  }

  const drawn = sample.tags.slice(0, 3).map(tag => {
    const link = template.cloneNode(true) as HTMLAnchorElement;
    const url = new URL(window.location.href);

    url.searchParams.set(TAG_PARAM, tag.uuid);
    link.href = url.pathname + url.search;
    link.textContent = tag.label;

    return link;
  });

  list.replaceChildren(...drawn);
}

function text(row: HTMLElement, name: string, value: string) {
  const element = row.querySelector(hook(name));

  if (element != null) {
    element.textContent = value;
  }
}

function duration(milliseconds: number) {
  const seconds = Math.round(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function fileOf(name: string) {
  return name.split("/").pop() ?? name;
}

/**
 * Shows how far through a row playback is, the two ways the two apps that came
 * before showed it: the waveform filled up to the playhead, which is what the
 * desktop app drew, and the thin bar under it, which is what Splice renders.
 */
export function showProgress(row: HTMLElement, progress: number) {
  const canvas = row.querySelector<HTMLCanvasElement>(`${hook(QA.waveform)} canvas`);
  const data = canvas == null ? undefined : drawn.get(canvas);

  if (canvas != null && data != null) {
    paintWaveform(canvas, data, progress);
  }

  showProgressBar(row, progress);
}

/** Splice's own playhead: a `progress` under the waveform, while it plays. */
function showProgressBar(row: HTMLElement, progress: number) {
  const cell = row.querySelector(hook(QA.waveform))?.closest(".cell--waveform") ??
    row.querySelector(hook(QA.waveform))?.parentElement;

  const existing = cell?.querySelector("progress");

  if (cell == null || progress <= 0) {
    existing?.remove();
    return;
  }

  const bar = existing ?? cell.appendChild(document.createElement("progress"));

  bar.className = CLASSES.progress;
  bar.max = 1;
  bar.value = progress;
}

/**
 * Splice's waveform: a column of bars either side of the middle, in whatever
 * colour the canvas has inherited, with everything already played drawn solid
 * and the rest faded. Drawn at the element's real pixel size, so it isn't soft
 * on a high-density screen.
 */
function paintWaveform(canvas: HTMLCanvasElement, data: number[], progress: number) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;

  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);

  const context = canvas.getContext("2d");

  if (context == null || data.length == 0) {
    return;
  }

  context.scale(ratio, ratio);
  context.fillStyle = window.getComputedStyle(canvas).color;

  const bars = Math.max(1, Math.floor(width / (BAR_WIDTH + BAR_GAP)));
  const middle = height / 2;
  const played = progress * bars;

  for (let bar = 0; bar < bars; bar++) {
    // A bar the playhead is standing on is drawn solid, so the edge between
    // what has been heard and what hasn't lands where the sound is.
    context.globalAlpha = bar < played ? 1 : AHEAD_ALPHA;

    // Each bar stands for a slice of the data, taken at its loudest.
    const from = Math.floor((bar / bars) * data.length);
    const to = Math.max(from + 1, Math.floor(((bar + 1) / bars) * data.length));

    let peak = 0;
    for (let i = from; i < to; i++) {
      peak = Math.max(peak, Math.abs(data[i] ?? 0));
    }

    const tall = Math.max(MIN_BAR, peak * height);
    context.fillRect(bar * (BAR_WIDTH + BAR_GAP), middle - tall / 2, BAR_WIDTH, tall);
  }
}
