// Builds the fake Splice responses the end-to-end run is served.

import path from "node:path";
import { fileURLToPath } from "node:url";

/** The built extension the runs load, which is this folder's neighbour. */
export const EXTENSION = path.join(fileURLToPath(new URL("..", import.meta.url)), "dist");

/**
 * A 1.5s 440 Hz sine as a 16-bit PCM WAV. Splice serves MP3s, but the pipeline
 * hands the bytes to decodeAudioData either way -- and no MP3 encoder is
 * available here.
 */
export function makeAudio({ seconds = 1.5, sampleRate = 44100 } = {}) {
  const frames = Math.floor(seconds * sampleRate);
  const buffer = Buffer.alloc(44 + frames * 2);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + frames * 2, 4);
  buffer.write("WAVEfmt ", 8, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(frames * 2, 40);

  for (let i = 0; i < frames; i++) {
    buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 9000), 44 + i * 2);
  }

  return buffer;
}

/**
 * Wraps audio in Splice's scrambled container. The unscrambling in
 * src/splice/decoder.ts is its own inverse, so the same passes produce it.
 */
export function scramble(audio, { size = 32768 } = {}) {
  const header = Buffer.alloc(28);
  header.write("SP", 0, "ascii");
  header.writeBigUInt64LE(BigInt(size), 2);

  for (let i = 10; i < 28; i++) {
    header[i] = 0x20 + ((i * 7) % 90); // an arbitrary but stable "key"
  }

  const key = [];
  for (let i = 10; i < 28; i++) key.push(header[i]);

  const payload = Buffer.from(audio);
  const pass = (start, end) => {
    let k = 0;
    for (let i = start; i < end; i++) {
      if (k > key.length - 1) k = 0;
      if (i < payload.length) payload[i] = payload[i] ^ key[k];
      k++;
    }
    return end;
  };

  const first = pass(0, size) + size;
  pass(first, first + size);

  return Buffer.concat([header, payload]);
}

export const CDN = "https://spliceproduction.s3.us-east-1.amazonaws.com";

const TAGS = {
  kick: { uuid: "tag-kick", label: "kick", taxonomy: { uuid: "tx-i", name: "Instrument" } },
  house: { uuid: "tag-house", label: "house", taxonomy: { uuid: "tx-g", name: "Genre" } },
  dry: { uuid: "tag-dry", label: "dry", taxonomy: { uuid: "tx-f", name: "Functional Attribute" } }
};

const PACK = {
  uuid: "pack-1",
  name: "Concrete Jungle Drums",
  permalink_base_url: "https://splice.com/sounds/packs/concrete",
  files: [{ path: "cover", asset_file_type_slug: "cover_image", url: `${CDN}/cover.png` }]
};

function sample(index, name, extra = {}) {
  return {
    uuid: `sample-${index}`,
    name,
    tags: [TAGS.kick, TAGS.dry].map(x => ({ uuid: x.uuid, label: x.label })),
    files: [
      { name: "preview", path: "p", asset_file_type_slug: "preview_mp3", url: `${CDN}/preview-${index}.mp3` },
      { name: "waveform", path: "w", asset_file_type_slug: "waveform", url: `${CDN}/waveform-${index}.json` }
    ],
    parents: { items: [PACK] },
    bpm: 128,
    chord_type: "minor",
    duration: 1400,
    instrument: "kick",
    key: "A",
    asset_category_slug: "loop",
    ...extra
  };
}

/** The search response, echoing back what the request asked for so filters can be asserted. */
export function searchResponse(requestBody) {
  const { variables } = JSON.parse(requestBody);
  const label = variables.filepath?.trim() || "kick";

  return {
    data: {
      assetsSearch: {
        items: [
          sample(1, `${label}_one.wav`),
          sample(2, `${label}_two.wav`, { asset_category_slug: "oneshot", bpm: null, key: null, chord_type: null })
        ],
        tag_summary: Object.values(TAGS).map(tag => ({ tag, count: 12 })),
        response_metadata: { records: 2 },
        pagination_metadata: { currentPage: variables.page ?? 1, totalPages: 3 }
      }
    }
  };
}

export const waveform = JSON.stringify(
  Array.from({ length: 120 }, (_, i) => Math.abs(Math.sin(i / 6)) * 0.9 + 0.05)
);

/** One of Splice's logged-out sample rows, as its markup spells it. */
export const loggedOutRow = filename => `
<div role="presentation" class="asset-row svelte-1aewf11" data-qa="sampleAssetRow">
  <div class="cell cell--playback" role="gridcell">
    <button data-qa="playPausePlaybackButton" class="variant-transparent icon icon-only">play</button>
  </div>
  <div class="cell cell--filename svelte-1aewf11" role="gridcell">
    <div data-qa="asset-filename" class="filename">${filename}</div>
  </div>
  <div class="cell cell--waveform" role="gridcell">
    <button aria-label="play sample" class="invisible svelte-1v7zsf1">
      <div class="waveform" data-qa="sounds.waveform-preview" style="width:160px;height:32px;color:#8f8">
        <canvas width="160" height="32" style="width:160px;height:32px"></canvas>
      </div>
    </button>
  </div>
  <div class="cell cell--actions" role="gridcell">
    <div class="asset-actions svelte-cmmuu7">
      <form class="top-level-action svelte-cmmuu7" action="https://splice.com/plans">
        <button type="button" class="variant-transparent icon-only icon-small" data-qa="license-button">License</button>
        <button type="button" class="variant-transparent icon-only icon-small" data-qa="like-button">Like</button>
      </form>
      <div class="details svelte-12ybw6r">
        <div><button class="menu-opener" aria-haspopup="true">...</button></div>
        <div data-qa="menu-container">
          <div class="menu-panel svelte-12ybw6r" data-qa="menu-panel" role="menu">
            <ul>
              <li role="presentation"><button data-qa="license-button">Get</button></li>
              <li role="presentation"><button data-qa="share-button" role="menuitem">Copy link</button></li>
              <li role="presentation"><a role="menuitem" href="https://splice.com/sounds/sample/${"c".repeat(64)}">Open in new tab</a></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;

/**
 * What Splice serves a logged-out reader: rows whose only actions are a licence
 * button and a heart, an invitation to register where the rest of the results
 * would be, and the FAQ that closes every listing.
 */
export const loggedOutPage = filenames => `<!doctype html><html lang="en" data-theme="light"><head><title>Search Samples | Splice</title></head>
  <body style="background:#111;color:#eee;font-family:sans-serif">
    <main>
      <div role="grid">${filenames.map(loggedOutRow).join("")}</div>
      <div class="remaining-results"><p>Register for full access</p></div>
    </main>
    <div style="height:2500px"></div>
    <section class="faq-section"><h3>FAQs</h3></section>
  </body></html>`;
