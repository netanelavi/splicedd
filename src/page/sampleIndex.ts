// Everything the panel has seen splice.com receive, kept so a sample can be
// recognised again later: by the preview file the page plays, by the hash in
// the row's permalink, or by the file name printed on the row.

import { SpliceSample } from "../splice/api";
import { previewKey, previewUrlOf } from "../splice/harvest";

/** How many samples to remember, so a long browse can't grow without bound. */
const LIMIT = 500;

export class SampleIndex {
  /** By the path of the preview file each sample plays. */
  private readonly previews = new Map<string, SpliceSample>();

  /** By the content hash of each of a sample's files. */
  private readonly hashes = new Map<string, SpliceSample>();

  /** By the file name a sample is shown under, with and without its extension. */
  private readonly names = new Map<string, SpliceSample>();

  add(samples: readonly SpliceSample[]) {
    for (const sample of samples) {
      const key = previewKey(previewUrlOf(sample) ?? "");

      // Without a preview there is nothing Splicedd could hand a DAW, so there
      // is no point remembering the sample at all.
      if (key == null) {
        continue;
      }

      // Re-inserting keeps the freshest copy, and the newest place in the queue
      // the overflow is evicted from.
      remember(this.previews, key, sample);

      for (const file of sample.files) {
        if (file.hash != null) {
          remember(this.hashes, file.hash.toLowerCase(), sample);
        }
      }

      for (const name of nameKeys(sample.name)) {
        remember(this.names, name, sample);
      }
    }

    for (const entries of [this.previews, this.hashes, this.names]) {
      evictOverflow(entries);
    }
  }

  /** The sample that plays the preview file at the given path. */
  byPreview(key: string): SpliceSample | null {
    return this.previews.get(key) ?? null;
  }

  /** The sample one of whose files has the given content hash. */
  byHash(hash: string): SpliceSample | null {
    return this.hashes.get(hash.toLowerCase()) ?? null;
  }

  /** The sample shown under the given file name. */
  byName(name: string): SpliceSample | null {
    for (const key of nameKeys(name)) {
      const sample = this.names.get(key);

      if (sample != null) {
        return sample;
      }
    }

    return null;
  }

  clear() {
    this.previews.clear();
    this.hashes.clear();
    this.names.clear();
  }
}

/**
 * The forms a sample's name can take: Splice's API returns a path, its pages
 * print the file, and either may carry the extension.
 */
function nameKeys(name: string): string[] {
  const file = name.split("/").pop()!.trim().toLowerCase();
  const stem = file.replace(/\.[a-z0-9]{1,4}$/, "");

  return file == stem ? [file] : [file, stem];
}

function remember(entries: Map<string, SpliceSample>, key: string, sample: SpliceSample) {
  entries.delete(key);
  entries.set(key, sample);
}

function evictOverflow(entries: Map<string, SpliceSample>) {
  for (const key of entries.keys()) {
    if (entries.size <= LIMIT)
      return;

    entries.delete(key);
  }
}
