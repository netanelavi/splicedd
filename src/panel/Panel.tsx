import { useState } from "react";
import { X } from "lucide-react";

import { assetUrl } from "../chrome/assets";
import { SpliceddSettings } from "../chrome/settings";
import { Toasts } from "./hooks/useToasts";
import { LikedView, PlayedView, SavedView, SearchedView } from "./components/SavedViews";
import SettingsView from "./components/SettingsView";
import { IconButton } from "./components/primitives";

type View = "settings" | "saved" | "liked" | "played" | "searched";

/**
 * Splicedd's own window on splice.com: the settings, and what it has saved.
 * Everything else happens on Splice's own page -- its rows carry the buttons,
 * and its listing is the listing.
 */
export default function Panel(
  { settings, toasts, onClose }: {
    settings: SpliceddSettings;
    toasts: Toasts;
    onClose: () => void;
  }
) {
  const [view, setView] = useState<View>("settings");

  return (
    <div className="sd-root">
      <div className="sd-panel">
        <header className="sd-header">
          <div className="sd-brand">
            <img src={assetUrl("icon-32.png")} alt="" />
            Splicedd
          </div>

          <div className="sd-header-actions">
            <IconButton label="Close" onClick={onClose}><X size={18} /></IconButton>
          </div>
        </header>

        <div className="sd-views" role="tablist">
          {([
            ["settings", "Settings"],
            ["saved", "Saved"],
            ["liked", "Liked"],
            ["played", "Played"],
            ["searched", "Searches"]
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="sd-view-tab"
              aria-selected={view == id}
              onClick={() => setView(id)}
            >{label}</button>
          ))}
        </div>

        {view == "settings" && <SettingsView settings={settings} />}
        {view == "saved" && <SavedView toasts={toasts} />}
        {view == "liked" && <LikedView toasts={toasts} />}
        {view == "played" && <PlayedView toasts={toasts} />}
        {view == "searched" && <SearchedView />}
      </div>
    </div>
  );
}
