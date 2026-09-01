import { ChordType, MusicKey, relativeKey } from "../../splice/entities";
import { Button } from "./primitives";

/** Keys laid out like an octave: the sharps sit between the naturals below them. */
const BLACK_KEYS: (MusicKey | null)[] = ["C#", "D#", null, "F#", "G#", "A#"];
const WHITE_KEYS: MusicKey[] = ["C", "D", "E", "F", "G", "A", "B"];

const SHARP = (key: MusicKey) => key.replace("#", "♯");

export default function KeyPicker(
  { musicKey, chord, onChange }: {
    musicKey: MusicKey | null;
    chord: ChordType | null;
    onChange: (key: MusicKey | null, chord: ChordType | null) => void;
  }
) {
  const keyButton = (key: MusicKey | null, index: number) => (
    key == null
      ? <button key={`spacer-${index}`} type="button" className="sd-key" data-spacer="true" tabIndex={-1} aria-hidden />
      : <button
          key={key}
          type="button"
          className="sd-key"
          data-selected={musicKey == key}
          onClick={() => onChange(musicKey == key ? null : key, chord)}
        >{SHARP(key)}</button>
  );

  return (
    <div className="sd-keys">
      <div className="sd-keys-row">
        <button type="button" className="sd-key" data-spacer="true" style={{ width: "50%" }} tabIndex={-1} aria-hidden />
        {BLACK_KEYS.map(keyButton)}
        <button type="button" className="sd-key" data-spacer="true" style={{ width: "50%" }} tabIndex={-1} aria-hidden />
      </div>

      <div className="sd-keys-row">{WHITE_KEYS.map(keyButton)}</div>

      <div className="sd-keys-row" style={{ marginTop: 6 }}>
        {(["major", "minor"] as ChordType[]).map(value => (
          <button
            key={value}
            type="button"
            className="sd-key"
            data-selected={chord == value}
            onClick={() => onChange(musicKey, chord == value ? null : value)}
          >{value == "major" ? "Major" : "Minor"}</button>
        ))}
      </div>

      <div className="sd-popover-footer">
        {/* The relative key shares the same pitches, e.g. A Minor and C Major. */}
        <Button
          variant="ghost"
          disabled={musicKey == null || chord == null}
          onClick={() => {
            const relative = relativeKey(musicKey!, chord!);
            onChange(relative.key, relative.chord);
          }}
        >Make relative</Button>

        <Button variant="link" onClick={() => onChange(null, null)}>Clear</Button>
      </div>
    </div>
  );
}
