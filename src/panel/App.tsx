import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { PanelCommand } from "../chrome/messages";
import { assetUrl } from "../chrome/assets";
import { settings as currentSettings, useSettings } from "../chrome/settings";
import { PageObserver } from "../page/observer";
import { Pager } from "../page/pager";
import { SampleResolver } from "../page/resolver";
import { SampleStore } from "./sampleStore";
import { runSearch } from "./search";
import { useSampleActions } from "./hooks/useSampleActions";
import { useSpliceSite } from "./hooks/useSpliceSite";
import { useToasts } from "./hooks/useToasts";
import NowPlaying from "./components/NowPlaying";
import PageStepper from "./components/PageStepper";
import ToastStack from "./components/ToastStack";
import Panel, { SearchCommand } from "./Panel";

/**
 * The panel's outermost piece: whether it is open, the commands the rest of the
 * extension sends it (the toolbar button, the keyboard shortcut and the context
 * menu all arrive here), and everything that has to outlive it -- the sample
 * cache, the toasts, and what splice.com itself is playing.
 */
export default function App({ host }: { host: HTMLElement }) {
  const settings = useSettings();
  const [open, setOpen] = useState(settings.openOnLoad);
  const [command, setCommand] = useState<SearchCommand | null>(null);

  // The cache outlives the panel, so closing and reopening doesn't throw away
  // everything that was already downloaded.
  const store = useMemo(() => new SampleStore(currentSettings), []);
  useEffect(() => () => store.dispose(), [store]);

  const toasts = useToasts();
  const actions = useSampleActions(store, toasts);

  // Watching splice.com's own requests means a sample played on Splice's page
  // can be dragged into a DAW without Splicedd searching for it again.
  const page = useMemo(() => new PageObserver(), []);
  useEffect(() => page.start(), [page]);
  const nowPlaying = useSyncExternalStore(page.subscribe, page.nowPlaying);

  // And knowing what the page holds is what lets Splice's own download and drag
  // buttons do Splicedd's work. A row the page never fetched -- Splice renders
  // its first page on the server -- is looked up with a search of our own.
  const resolver = useMemo(
    () => new SampleResolver(page.index, async filters => (await runSearch(filters)).items),
    [page]
  );

  useSpliceSite({ resolver, store, actions, toasts, host });

  // Splice paginates at the foot of a very long list; this offers the same
  // movement from where the samples actually are.
  const pager = useMemo(() => new Pager(), []);
  useEffect(() => pager.start(), [pager]);
  const pages = useSyncExternalStore(pager.subscribe, pager.current);

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

  return (
    <>
      {open
        ? <Panel
            store={store}
            actions={actions}
            toasts={toasts}
            nowPlaying={nowPlaying}
            command={command}
            onClose={() => setOpen(false)}
          />
        : <button type="button" className="sd-launcher" onClick={() => setOpen(true)}>
            <img src={assetUrl("icon-32.png")} alt="" width={18} height={18} />
            Splicedd
          </button>}

      {/* Anchored to the viewport rather than the panel, so a toast still shows
          when the panel is closed -- a drag from the launcher can fail too. */}
      <div className="sd-dock">
        <ToastStack toasts={toasts.toasts} dismiss={toasts.dismiss} />

        {!open && nowPlaying != null &&
          <NowPlaying sample={nowPlaying} store={store} actions={actions} variant="floating" />}

        {pages != null && <PageStepper state={pages} onTurn={pager.turn} />}
      </div>
    </>
  );
}
