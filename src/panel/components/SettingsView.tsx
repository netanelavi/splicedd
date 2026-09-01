import { ReactNode } from "react";
import { FolderOpen, Palette, Rows3 } from "lucide-react";

import { SpliceddSettings, mutateSettings } from "../../chrome/settings";
import { Select, Switch } from "./primitives";

const FORMATS = [
  { value: "wav" as const, label: "WAV (16-bit)" },
  { value: "mp3" as const, label: "MP3 (as Splice encodes it)" }
];

const THEMES = [
  { value: "dark" as const, label: "Dark" },
  { value: "light" as const, label: "Light" }
];

const PAGE_SIZES = [
  { value: "20", label: "20 per page" },
  { value: "50", label: "50 per page" },
  { value: "100", label: "100 per page" }
];

function Setting(
  { title, description, children }: { title: string; description: string; children: ReactNode }
) {
  return (
    <div className="sd-setting">
      <div className="sd-setting-text">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      {children}
    </div>
  );
}

export default function SettingsView({ settings }: { settings: SpliceddSettings }) {
  const set = <K extends keyof SpliceddSettings>(key: K, value: SpliceddSettings[K]) =>
    void mutateSettings({ [key]: value } as Pick<SpliceddSettings, K>);

  return (
    <div className="sd-settings">
      <div>
        <span className="sd-label">Download folder</span>
        <div className="sd-field" style={{ marginTop: 6, height: 34 }}>
          <FolderOpen size={15} aria-hidden />
          <input
            className="sd-text-input"
            style={{ border: "none", background: "none", height: "auto", padding: 0 }}
            aria-label="Download folder"
            value={settings.downloadDir}
            placeholder="Splicedd"
            onChange={ev => set("downloadDir", ev.target.value)}
          />
        </div>
        <p className="sd-hint" style={{ marginTop: 6 }}>
          Relative to the folder your browser downloads to. Leave it empty to save samples there directly.
        </p>
      </div>

      <Setting title="Folder per pack" description="Group samples by the pack they came from.">
        <Switch label="Folder per pack" checked={settings.organizeByPack} onChange={x => set("organizeByPack", x)} />
      </Setting>

      <Setting title="Format" description="WAV is what most DAWs prefer.">
        <Select
          icon={Rows3} label="Format" value={settings.format} options={FORMATS}
          onChange={x => set("format", x)}
        />
      </Setting>

      <Setting title="Trim encoder delay" description="Drops the silence MP3 encoders add, so loops start on the beat.">
        <Switch
          label="Trim encoder delay"
          checked={settings.trimEncoderDelay}
          onChange={x => set("trimEncoderDelay", x)}
        />
      </Setting>

      <Setting title="Save when dragging" description="Also keep a copy on disk whenever a sample is dragged out.">
        <Switch label="Save when dragging" checked={settings.saveOnDrag} onChange={x => set("saveOnDrag", x)} />
      </Setting>

      <Setting title="Open with splice.com" description="Show the panel as soon as a Splice page loads.">
        <Switch label="Open with splice.com" checked={settings.openOnLoad} onChange={x => set("openOnLoad", x)} />
      </Setting>

      <Setting title="Results" description="How many samples each search page holds.">
        <Select
          icon={Rows3} label="Results per page"
          value={settings.resultsPerPage.toString()} options={PAGE_SIZES}
          onChange={x => set("resultsPerPage", parseInt(x, 10))}
        />
      </Setting>

      <Setting title="Theme" description="How the panel looks.">
        <Select
          icon={Palette} label="Theme" value={settings.theme} options={THEMES}
          onChange={x => set("theme", x)}
        />
      </Setting>

      <p className="sd-hint">
        Drag a sample straight from the list into your DAW's arrangement or browser. Chromium writes the file out
        as it lands, and a copy stays in your download folder while "Save when dragging" is on.
      </p>
    </div>
  );
}
