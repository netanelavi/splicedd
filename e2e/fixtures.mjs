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
