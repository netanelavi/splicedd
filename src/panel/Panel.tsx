import { X } from "lucide-react";

import { assetUrl } from "../chrome/assets";
import { SpliceddSettings } from "../chrome/settings";
import SettingsView from "./components/SettingsView";
import { IconButton } from "./components/primitives";

/**
 * Splicedd's own window on splice.com, which holds the settings and nothing
 * else. Everything else happens on Splice's own page: its rows carry the
 * buttons, and its listing is the listing.
 */
export default function Panel(
  { settings, onClose }: { settings: SpliceddSettings; onClose: () => void }
) {
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

        <SettingsView settings={settings} />
      </div>
    </div>
  );
}
