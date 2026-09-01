// Turns a Splice search result into files: fetch the scrambled preview,
// unscramble it, and hold on to the results so playing, dragging and
// downloading the same sample only does the work once.

import { Bytes } from "../bytes";
import { SpliceSample } from "../splice/api";
import { decodeSpliceAudio } from "../splice/decoder";
import { previewUrlOf } from "../splice/harvest";
import { mp3ToWav } from "../splice/audio";
import { samplePath } from "../splice/paths";
import { folderFile, folderHas } from "../chrome/folder";
import { fetchBytes } from "../chrome/net";
import { SpliceddSettings } from "../chrome/settings";

/** A sample rendered into a file, ready to be dragged into a DAW or saved. */
export interface SampleFile {
  bytes: Bytes;

  /** An object URL for the bytes, which is what drag-and-drop hands to the DAW. */
  url: string;

  mime: string;

  /** Where the file belongs inside a sample library, e.g. `Pack_Name/kick.wav`. */
  path: string;

  /** The file's own name, without any folders. */
  name: string;
}

const MIME_TYPES = { wav: "audio/wav", mp3: "audio/mpeg" } as const;

/** How many samples' audio to hold on to before evicting the oldest. */
const CACHE_LIMIT = 40;

/**
 * A rendered file, and the promise that produced it. Drag-and-drop can only use
 * the former: `dragstart` has to attach its payload synchronously.
 */
interface Rendering {
  promise: Promise<SampleFile>;
  file?: SampleFile;
}

interface CacheEntry {
  /**
   * The unscrambled preview, as Splice encoded it. Fetched the first time
   * something actually needs it, so a sample already in the library is never
   * downloaded to be written over itself.
   */
  mp3?: Promise<Bytes>;

  /** An object URL for the preview, created the first time it is played. */
  previewUrl?: Promise<string>;

  /** Files rendered from the preview, keyed by the settings they were made under. */
  renderings: Map<string, Rendering>;

  urls: string[];
}

/**
 * The panel's sample cache. Settings arrive through a provider rather than an
 * import, so the store doesn't care where they are stored.
 */
export class SampleStore {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly settings: () => SpliceddSettings) {}

  /** Starts downloading a sample's preview without waiting for it. */
  prefetch(sample: SpliceSample) {
    // Nothing awaits a prefetch; a real request reports the failure itself.
    void this.warm(sample).catch(() => {});
  }

  private async warm(sample: SpliceSample) {
    const entry = this.entryOf(sample);

    if (entry.mp3 == null && !await folderHas(this.pathOf(sample))) {
      void this.audio(entry, sample).catch(() => {});
    }
  }

  /** Resolves to an object URL that plays the sample's preview. */
  preview(sample: SpliceSample): Promise<string> {
    const entry = this.entryOf(sample);

    entry.previewUrl ??= this.audio(entry, sample).then(mp3 =>
      this.track(entry, new Blob([mp3], { type: MIME_TYPES.mp3 }))
    );

    return entry.previewUrl;
  }

  /** Renders the sample into the file format the user picked. */
  file(sample: SpliceSample): Promise<SampleFile> {
    return this.renderingOf(sample).promise;
  }

  /**
   * The sample's file, if it has already been rendered, which is what a
   * `dragstart` handler can hand over without awaiting anything.
   */
  peek(sample: SpliceSample): SampleFile | undefined {
    return this.entries.get(sample.uuid)?.renderings.get(this.renderKey())?.file;
  }

  /** Releases every object URL the store handed out. */
  dispose() {
    for (const entry of this.entries.values()) {
      this.release(entry);
    }

    this.entries.clear();
  }

  private renderingOf(sample: SpliceSample): Rendering {
    const entry = this.entryOf(sample);
    const key = this.renderKey();

    let rendering = entry.renderings.get(key);
    if (rendering == null) {
      const created: Rendering = { promise: this.render(entry, sample) };
      created.promise.then(file => { created.file = file; }, () => {});

      entry.renderings.set(key, created);
      rendering = created;
    }

    return rendering;
  }

  private async render(entry: CacheEntry, sample: SpliceSample): Promise<SampleFile> {
    const { format } = this.settings();

    const mime = MIME_TYPES[format];
    const path = this.pathOf(sample);

    // A sample already in the library is the sample. Reading it back skips the
    // download and the conversion, and hands the DAW the very file on disk.
    const bytes = await folderFile(path) ?? await this.encode(entry, sample, format);

    return {
      bytes,
      mime,
      url: this.track(entry, new Blob([bytes], { type: mime })),
      path,
      name: path.split("/").pop()!
    };
  }

  /** Where the sample belongs in a library, under the current settings. */
  private pathOf(sample: SpliceSample) {
    return samplePath(sample, { extension: this.settings().format });
  }

  private async encode(entry: CacheEntry, sample: SpliceSample, format: "wav" | "mp3") {
    const mp3 = await this.audio(entry, sample);

    return format == "wav"
      ? await mp3ToWav(mp3, { durationMs: sample.duration, trimEncoderDelay: true })
      : mp3;
  }

  /** The unscrambled preview, downloaded once however many things want it. */
  private audio(entry: CacheEntry, sample: SpliceSample) {
    return entry.mp3 ??= fetchPreview(sample);
  }

  private entryOf(sample: SpliceSample): CacheEntry {
    let entry = this.entries.get(sample.uuid);

    if (entry == null) {
      entry = { renderings: new Map(), urls: [] };
      this.entries.set(sample.uuid, entry);
      this.evictOverflow();
    }

    return entry;
  }

  /** Files rendered under different settings are different files. */
  private renderKey() {
    return this.settings().format;
  }

  private track(entry: CacheEntry, blob: Blob) {
    const url = URL.createObjectURL(blob);
    entry.urls.push(url);
    return url;
  }

  private evictOverflow() {
    for (const [uuid, entry] of this.entries) {
      if (this.entries.size <= CACHE_LIMIT)
        return;

      this.release(entry);
      this.entries.delete(uuid);
    }
  }

  private release(entry: CacheEntry) {
    for (const url of entry.urls) {
      URL.revokeObjectURL(url);
    }

    entry.urls.length = 0;
  }
}

async function fetchPreview(sample: SpliceSample): Promise<Bytes> {
  const preview = previewUrlOf(sample);
  if (preview == null) {
    throw new Error(`"${sample.name}" has no preview to download`);
  }

  return decodeSpliceAudio(await fetchBytes(preview));
}
