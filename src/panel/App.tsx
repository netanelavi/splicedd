import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { PanelCommand } from "../chrome/messages";
import { fetchJson } from "../chrome/net";
import { settings as currentSettings } from "../chrome/settings";
import { PageObserver } from "../page/observer";
import { Pager } from "../page/pager";
import { SiteInjector } from "../page/inject";
import { RowList } from "../page/list";
import { SampleResolver } from "../page/resolver";
import { followPageTheme, setUpsellsHidden, showListTop } from "../page/site";
import { SampleStore } from "./sampleStore";
import { runSearch } from "./search";
import { useSampleActions } from "./hooks/useSampleActions";
import { useSpliceSite } from "./hooks/useSpliceSite";
import { useToasts } from "./hooks/useToasts";
import { useSettings } from "./useSettings";
import NowPlaying from "./components/NowPlaying";
import ToastStack from "./components/ToastStack";
import Panel from "./Panel";

/**
 * Everything Splicedd puts on a splice.com page, and the little that outlives
 * it: the sample cache, the toasts, and what the page itself is doing.
 *
 * The panel holds the settings and nothing else. The extension's actual work
 * happens on Splice's own markup -- its rows carry the buttons, and its listing
 * is the listing.
 */
export default function App({ host }: { host: HTMLElement }) {
  const settings = useSettings();
  const [open, setOpen] = useState(false);

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
  // its listings on the server -- is looked up with a search of our own.
  const resolver = useMemo(() => new SampleResolver(page.index, runSearch), [page]);

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

          // A page turned from the paginator at the foot of a very long list
          // would otherwise leave the reader at the foot of it.
          showListTop();
        }
      },
      () => { if (live) injector.refresh(null); }
    );

    return () => { live = false; };
  }, [resolver, injector, listing, pages?.search]);

  useEffect(() => setUpsellsHidden(settings.hideUpsells), [settings.hideUpsells]);

  // The panel is a guest on Splice's page, and dresses like its host.
  useEffect(() => followPageTheme(theme => { host.dataset.theme = theme; }), [host]);

  useEffect(() => {
    const onCommand = (message: PanelCommand) => {
      if (message.kind == "toggle-panel") {
        setOpen(x => !x);
      } else {
        setOpen(true);
      }
    };

    chrome.runtime.onMessage.addListener(onCommand);
    return () => chrome.runtime.onMessage.removeListener(onCommand);
  }, []);

  return (
    <>
      {open && <Panel settings={settings} onClose={() => setOpen(false)} />}

      {/* Anchored to the viewport rather than the panel, so a toast still shows
          when it's closed -- most of the work happens with it closed. */}
      <div className="sd-dock">
        <ToastStack toasts={toasts.toasts} dismiss={toasts.dismiss} />

        {nowPlaying != null &&
          <NowPlaying sample={nowPlaying} store={store} actions={actions} variant="floating" />}
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
