import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { PanelCommand } from "../chrome/messages";
import { assetUrl } from "../chrome/assets";
import { fetchJson } from "../chrome/net";
import { settings as currentSettings } from "../chrome/settings";
import { useSettings } from "./useSettings";
import { PageObserver } from "../page/observer";
import { Pager } from "../page/pager";
import { SiteInjector } from "../page/inject";
import { RowList } from "../page/list";
import { SampleResolver } from "../page/resolver";
import { setUpsellsHidden } from "../page/site";
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
  const [showSettings, setShowSettings] = useState(false);
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
  const resolver = useMemo(() => new SampleResolver(page.index, runSearch), [page]);

  // Splice paginates at the foot of a very long list; this offers the same
  // movement from where the samples actually are.
  const pager = useMemo(() => new Pager(), []);
  useEffect(() => pager.start(), [pager]);
  const pages = useSyncExternalStore(pager.subscribe, pager.current);

  useSpliceSite({ resolver, store, actions, toasts, host, openPage: pager.open });

  // A logged-out row has nothing to download with and nothing to drag, and a
  // logged-out listing doesn't page at all. Splicedd adds all three.
  const injector = useMemo(() => new SiteInjector(perPage => pager.open(withPerPage(perPage))), [pager]);
  useEffect(() => injector.start(), [injector]);

  const listing = useMemo(() => new RowList(fetchJson), []);

  // How far the listing runs, and what is on the page being asked for: neither
  // is anything the page itself can say, and asking Splice's server for a page
  // past the first returns the first, so Splicedd draws it from the answer.
  useEffect(() => {
    let live = true;

    resolver.pageResult().then(
      result => {
        if (!live || result == null) {
          return;
        }

        injector.refresh({ page: result.currentPage, totalPages: result.totalPages });

        if (asksBeyondTheFirstPage() && !listing.shows(result.items)) {
          listing.show(result.items);
        }
      },
      () => { if (live) injector.refresh(null); }
    );

    return () => { live = false; };
  }, [resolver, injector, listing, pages?.search]);

  useEffect(() => setUpsellsHidden(settings.hideUpsells), [settings.hideUpsells]);

  useEffect(() => {
    const onCommand = (message: PanelCommand) => {
      switch (message.kind) {
        case "toggle-panel":
          setOpen(x => !x);
          break;
        case "settings":
          setOpen(true);
          setShowSettings(true);
          break;
        case "search":
          setOpen(true);
          setShowSettings(false);
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
            showSettings={showSettings}
            onShowSettings={setShowSettings}
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

/**
 * The address for a different number of samples per page. The size belongs to
 * the search, so a search that changed size starts again from its first page.
 */
function withPerPage(perPage: number) {
  const url = new URL(window.location.href);

  url.searchParams.set("limit", perPage.toString());
  url.searchParams.delete("page");

  return url.href;
}

/**
 * Whether the address asks for something Splice didn't render. Splice serves
 * the first page of a search and nothing else, so anything past it -- another
 * page, or more of them at a time -- is Splicedd's to draw.
 */
function asksBeyondTheFirstPage() {
  const params = new URL(window.location.href).searchParams;
  return parseInt(params.get("page") ?? "1", 10) > 1 || params.has("limit");
}
