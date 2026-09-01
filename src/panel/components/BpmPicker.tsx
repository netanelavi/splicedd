import { useState } from "react";

import { BpmFilter, BpmFilterType, MAX_BPM, MIN_BPM } from "../../splice/entities";
import { Button } from "./primitives";

function clamp(value: string): number | null {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : Math.min(Math.max(parsed, MIN_BPM), MAX_BPM);
}

export default function BpmPicker(
  { type, bpm, onApply, onClear }: {
    type: BpmFilterType;
    bpm: BpmFilter | undefined;
    onApply: (type: BpmFilterType, bpm: BpmFilter) => void;
    onClear: () => void;
  }
) {
  const [tab, setTab] = useState<BpmFilterType>(type);
  const [exact, setExact] = useState<number | null>(bpm?.bpm != null ? clamp(bpm.bpm) : null);
  const [min, setMin] = useState<number | null>(bpm?.minBpm ?? null);
  const [max, setMax] = useState<number | null>(bpm?.maxBpm ?? null);

  const canApply = tab == "exact" ? exact != null : min != null || max != null;

  function apply() {
    if (!canApply)
      return;

    if (tab == "exact") {
      onApply("exact", { bpm: exact!.toString() });
    } else {
      onApply("range", { minBpm: min ?? MIN_BPM, maxBpm: max ?? MAX_BPM });
    }
  }

  const input = (
    label: string, value: number | null, onChange: (value: number | null) => void
  ) => (
    <input
      className="sd-number"
      type="number"
      inputMode="numeric"
      min={MIN_BPM}
      max={MAX_BPM}
      aria-label={label}
      placeholder={label}
      value={value ?? ""}
      onChange={ev => onChange(clamp(ev.target.value))}
      onKeyDown={ev => { if (ev.key == "Enter") apply(); }}
    />
  );

  return (
    <div>
      <div className="sd-tabs" role="tablist" aria-label="BPM filter type">
        {(["range", "exact"] as BpmFilterType[]).map(value => (
          <button
            key={value}
            type="button"
            role="tab"
            className="sd-tab"
            aria-selected={tab == value}
            data-selected={tab == value}
            onClick={() => setTab(value)}
          >{value == "range" ? "Range" : "Exact"}</button>
        ))}
      </div>

      <div className="sd-row-between" style={{ marginTop: 14 }}>
        <span className="sd-label">{tab == "exact" ? "Tempo" : "Between"}</span>

        {tab == "exact"
          ? input("BPM", exact, setExact)
          : <div className="sd-row-between" style={{ gap: 6 }}>
              {input("Min", min, setMin)}
              <span style={{ color: "var(--sd-muted)" }}>-</span>
              {input("Max", max, setMax)}
            </div>}
      </div>

      <div className="sd-popover-footer">
        <Button variant="link" onClick={onClear}>Clear</Button>
        <Button disabled={!canApply} onClick={apply}>Apply</Button>
      </div>
    </div>
  );
}
