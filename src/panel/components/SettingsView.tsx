import { ReactNode, useEffect, useState } from "react";
import { FolderOpen, Rows3 } from "lucide-react";

import { canChooseFolder, chooseFolder, folderName, forgetFolder } from "../../chrome/folder";
import { errorMessage } from "../../chrome/messages";
import { DOWNLOADS_FOLDER, SpliceddSettings, mutateSettings } from "../../chrome/settings";
import { Button, Select, Switch } from "./primitives";

const FORMATS = [
  { value: "wav" as const, label: "WAV (16-bit)" },
  { value: "mp3" as const, label: "MP3 (as Splice encodes it)" }
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

      <Setting title="Format" description="WAV is what most DAWs prefer.">
        <Select
          icon={Rows3} label="Format" value={settings.format} options={FORMATS}
          onChange={x => set("format", x)}
        />
      </Setting>

      <Setting
        title="Hide the upsells"
        description="Takes down Splice's subscribe prompts. Off keeps the licence buttons."
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

      <p className="sd-hint">
        Samples are saved as <code>Pack_Name/sample_name</code>, and one already there is used rather than
        downloaded again. Drag a row straight into your DAW; the file is written as the drop lands.
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
          {folder ?? `Downloads / ${DOWNLOADS_FOLDER}`}
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
