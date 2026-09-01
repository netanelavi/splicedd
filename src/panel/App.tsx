import { useEffect, useMemo, useState } from "react";

import { PanelCommand } from "../chrome/messages";
import { assetUrl } from "../chrome/assets";
import { settings as currentSettings, useSettings } from "../chrome/settings";
import { SampleStore } from "./sampleStore";
import Panel, { SearchCommand } from "./Panel";

/**
 * The panel's outermost piece: whether it is open, and the commands the rest of
 * the extension sends it (the toolbar button, the keyboard shortcut and the
 * context menu all arrive here).
 */
export default function App({ host }: { host: HTMLElement }) {
  const settings = useSettings();
  const [open, setOpen] = useState(settings.openOnLoad);
  const [command, setCommand] = useState<SearchCommand | null>(null);

  // The cache outlives the panel, so closing and reopening doesn't throw away
  // everything that was already downloaded.
  const store = useMemo(() => new SampleStore(currentSettings), []);
  useEffect(() => () => store.dispose(), [store]);

  useEffect(() => {
    const onCommand = (message: PanelCommand) => {
      switch (message.kind) {
        case "toggle-panel":
          setOpen(x => !x);
          break;
        case "search":
          setOpen(true);
          setCommand({ query: message.query, nonce: Date.now() });
          break;
      }
    };

    chrome.runtime.onMessage.addListener(onCommand);
    return () => chrome.runtime.onMessage.removeListener(onCommand);
  }, []);

  useEffect(() => {
    host.dataset.theme = settings.theme;
  }, [host, settings.theme]);

  if (!open) {
    return (
      <button type="button" className="sd-launcher" onClick={() => setOpen(true)}>
        <img src={assetUrl("icon-32.png")} alt="" width={18} height={18} />
        Splicedd
      </button>
    );
  }

  return <Panel store={store} command={command} onClose={() => setOpen(false)} />;
}
