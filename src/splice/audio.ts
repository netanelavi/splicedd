import { Bytes } from "../bytes";

/**
 * Turning Splice's scrambled MP3 previews into audio a DAW can load. Platform
 * independent: it only needs the Web Audio API, which both the desktop shell and
 * the browser extension provide.
 */

/**
 * Samples MP3 encoders prepend to the stream. Dropping them makes a loop start
 * exactly on the beat, which is what a DAW expects when the sample is dropped
 * onto a grid.
 */
const ENCODER_DELAY_FRAMES = 1200;

/**
 * Above this length, samples are written out as-is. Slicing the channels of a
 * very long sample can fail on memory allocation, and a sample this long is
 * never a loop that needs its start trimmed anyway.
 */
const LARGE_SAMPLE_FRAMES = 60 * 44100;

export interface WavConversionOptions {
  /** Length of the sample in milliseconds, as reported by Splice. */
  durationMs: number;

  /** Whether to drop the MP3 encoder delay at the start. Defaults to `true`. */
  trimEncoderDelay?: boolean;
}

/** Decodes an (already unscrambled) MP3 and re-encodes it as a 16-bit PCM WAV. */
export async function mp3ToWav(
  mp3: Bytes,
  { durationMs, trimEncoderDelay = true }: WavConversionOptions
): Promise<Bytes> {
  const ctx = createDecodingContext(readMp3SampleRate(mp3));

  // decodeAudioData detaches the buffer it's given, so it always gets a copy —
  // callers keep using the MP3 for playback afterwards.
  const decoded = await ctx.decodeAudioData(mp3.slice().buffer);

  const trim = trimEncoderDelay && decoded.length < LARGE_SAMPLE_FRAMES;
  const start = trim ? ENCODER_DELAY_FRAMES : 0;

  // Splice's length says where the audio ends and the encoder's padding
  // begins; without one, all of it is kept rather than none of it.
  const end = trim && durationMs > 0
    ? start + Math.round((durationMs / 1000) * decoded.sampleRate)
    : decoded.length;

  const channels: Float32Array[] = [];
  for (let i = 0; i < decoded.numberOfChannels; i++) {
    channels.push(decoded.getChannelData(i).subarray(start, end));
  }

  return encodeWav(channels, decoded.sampleRate);
}

/**
 * An offline context only decodes — it never touches the audio hardware, and so
 * is never suspended by the browser's autoplay policy. Decoding into a context
 * that runs at the MP3's own sample rate also avoids a needless resample.
 */
function createDecodingContext(sampleRate: number | null): OfflineAudioContext {
  if (sampleRate != null) {
    try {
      return new OfflineAudioContext(1, 1, sampleRate);
    } catch {
      // Some platforms reject unusual rates; fall through to the default one.
    }
  }

  return new OfflineAudioContext(1, 1, 44100);
}

/** Encodes raw channel data as a 16-bit PCM WAV file. */
export function encodeWav(channels: Float32Array[], sampleRate: number): Bytes {
  const numChannels = Math.max(channels.length, 1);
  const frames = channels.length == 0 ? 0 : Math.min(...channels.map(x => x.length));

  const dataBytes = frames * numChannels * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");

  ascii(12, "fmt ");
  view.setUint32(16, 16, true);                              // format chunk length
  view.setUint16(20, 1, true);                               // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);    // byte rate
  view.setUint16(32, numChannels * 2, true);                 // block align
  view.setUint16(34, 16, true);                              // bits per sample

  ascii(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const value = Math.max(-1, Math.min(1, channels[channel][frame]));
      view.setInt16(offset, Math.round(value * (value < 0 ? 0x8000 : 0x7fff)), true);
      offset += 2;
    }
  }

  return new Uint8Array(buffer);
}

const MPEG_SAMPLE_RATES: Record<number, number[]> = {
  0b11: [44100, 48000, 32000],   // MPEG 1
  0b10: [22050, 24000, 16000],   // MPEG 2
  0b00: [11025, 12000, 8000]     // MPEG 2.5
};

/**
 * How far past the tags a frame header may start. A real MPEG stream begins
 * with one; searching the whole file instead would eventually find four bytes
 * that merely look like a header inside the audio itself.
 */
const FRAME_SEARCH_WINDOW = 64;

/**
 * Reads the sample rate out of the first MPEG audio frame header, or returns
 * `null` when the bytes don't start with one.
 */
export function readMp3SampleRate(mp3: Bytes): number | null {
  let start = 0;

  // ID3v2 tags sit in front of the audio and can be sizable; their length is
  // stored as four 7-bit ("syncsafe") bytes.
  if (mp3.length > 10 && mp3[0] == 0x49 && mp3[1] == 0x44 && mp3[2] == 0x33) {
    start = 10 + ((mp3[6] << 21) | (mp3[7] << 14) | (mp3[8] << 7) | mp3[9]);
  }

  for (let i = start; i < Math.min(start + FRAME_SEARCH_WINDOW, mp3.length - 3); i++) {
    const rate = frameSampleRate(mp3, i);

    if (rate != null)
      return rate;
  }

  return null;
}

/** The sample rate of the frame header at `offset`, if there is a valid one there. */
function frameSampleRate(mp3: Bytes, offset: number): number | null {
  if (mp3[offset] != 0xFF || (mp3[offset + 1] & 0xE0) != 0xE0) {
    return null;
  }

  const version = (mp3[offset + 1] >> 3) & 0b11;
  const layer = (mp3[offset + 1] >> 1) & 0b11;
  const rateIndex = (mp3[offset + 2] >> 2) & 0b11;

  // 0b01 (version), 0b00 (layer) and 0b11 (sample rate) are all reserved.
  if (version == 0b01 || layer == 0b00 || rateIndex == 0b11) {
    return null;
  }

  return MPEG_SAMPLE_RATES[version]?.[rateIndex] ?? null;
}
