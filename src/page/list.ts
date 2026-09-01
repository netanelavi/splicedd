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
import { EMPTY_WAVEFORM, WAVEFORM_VIEW_BOX, waveformPath } from "../splice/waveform";
import { QA, ROW_MARK, hook, rows } from "./site";

/** Where a tag on a row links: the same search, narrowed to that tag. */
const TAG_PARAM = "tags";

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

  /** Whether the listing on screen is already the given one. */
  shows(samples: readonly SpliceSample[]) {
    const drawn = rows();

    return drawn.length == samples.length && drawn.every((row, index) =>
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

  private drawWaveform(row: HTMLElement, sample: SpliceSample) {
    const target = row.querySelector(hook(QA.waveform));
    const url = sample.files.find(x => x.asset_file_type_slug == "waveform")?.url;

    if (target == null) {
      return;
    }

    // Splice draws its waveforms onto a canvas from a file it fetches per row.
    // Drawing an SVG instead means the row is complete the moment the data
    // lands, with no measuring and no second paint.
    const draw = (data: number[]) => {
      target.innerHTML =
        `<svg viewBox="0 0 ${WAVEFORM_VIEW_BOX.width} ${WAVEFORM_VIEW_BOX.height}" preserveAspectRatio="none" ` +
        `style="width:100%;height:100%;display:block">` +
        `<path fill="currentColor" opacity="0.65" d="${waveformPath(data)}"></path></svg>`;
    };

    draw(EMPTY_WAVEFORM);

    if (url != null) {
      this.waveform(url).then(draw, () => {});
    }
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
