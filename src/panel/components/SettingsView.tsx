import { ReactNode, useEffect, useState } from "react";
import { FolderOpen, Palette, Rows3 } from "lucide-react";

import { canChooseFolder, chooseFolder, folderName, forgetFolder } from "../../chrome/folder";
import { errorMessage } from "../../chrome/messages";
import { SpliceddSettings, mutateSettings } from "../../chrome/settings";
import { Button, Select, Switch } from "./primitives";

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
      <FolderSetting />

      <div>
        <span className="sd-label">Subfolder</span>
        <div className="sd-field" style={{ marginTop: 6, height: 34 }}>
          <FolderOpen size={15} aria-hidden />
          <input
            className="sd-text-input"
            style={{ border: "none", background: "none", height: "auto", padding: 0 }}
            aria-label="Subfolder"
            value={settings.downloadDir}
            placeholder="Splicedd"
            onChange={ev => set("downloadDir", ev.target.value)}
          />
        </div>
        <p className="sd-hint" style={{ marginTop: 6 }}>
          Nested inside the folder above. Leave it empty to save samples there directly.
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

      <Setting
        title="Hide the upsells"
        description="Takes down Splice's subscribe prompts. Turn it off to keep the licence buttons."
      >
        <Switch label="Hide the upsells" checked={settings.hideUpsells} onChange={x => set("hideUpsells", x)} />
      </Setting>

      <Setting
        title="Block analytics"
        description="Stops splice.com reporting what you browse and play to its trackers."
      >
        <Switch
          label="Block analytics"
          checked={settings.blockAnalytics}
          onChange={x => set("blockAnalytics", x)}
        />
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

      <p className="sd-hint" style={{ opacity: 0.7 }}>Build {__BUILD__}</p>
    </div>
  );
}

/**
 * The folder samples are written into. Picking one hands Splicedd a handle to
 * write through, which is what keeps a sample's own name and place; without
 * one, files go to the browser's download folder and the browser names them.
 */
function FolderSetting() {
  const [folder, setFolder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void folderName().then(setFolder); }, []);

  async function choose() {
    setError(null);

    try {
      const chosen = await chooseFolder();

      if (chosen != null) {
        setFolder(chosen);
      }
    } catch (err) {
      // Dismissing the picker is an abort, and is not worth reporting.
      if (!(err instanceof DOMException && err.name == "AbortError")) {
        setError(errorMessage(err));
      }
    }
  }

  async function clear() {
    await forgetFolder();
    setFolder(null);
  }

  return (
    <div>
      <span className="sd-label">Save samples to</span>

      <div className="sd-row-between" style={{ marginTop: 6 }}>
        <span className="sd-folder">
          <FolderOpen size={15} aria-hidden />
          {folder ?? "Your browser's downloads"}
        </span>

        {canChooseFolder() &&
          <span style={{ display: "flex", gap: 4 }}>
            {folder != null && <Button variant="link" onClick={() => void clear()}>Clear</Button>}
            <Button variant="ghost" onClick={() => void choose()}>Choose...</Button>
          </span>}
      </div>

      <p className="sd-hint" style={{ marginTop: 6 }}>
        {error ?? (folder != null
          ? "Samples are written straight into this folder, keeping their own names."
          : "Pick a folder and samples are written into it with their own names, rather than " +
            "landing in your downloads under a name the browser chooses.")}
      </p>
    </div>
  );
}
