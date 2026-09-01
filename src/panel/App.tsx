import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { PanelCommand } from "../chrome/messages";
import { played, searched } from "../chrome/lists";
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
import { entryOf, useSpliceSite } from "./hooks/useSpliceSite";
import { useToasts } from "./hooks/useToasts";
import { useSettings } from "./useSettings";
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

  // What Splice's own player starts is worth noting whether or not it is kept.
  useEffect(() => {
    if (nowPlaying != null) {
      void played.add(entryOf(nowPlaying));
    }
  }, [nowPlaying]);

  // And knowing what the page holds is what lets Splice's own download and drag
  // buttons do Splicedd's work. A row the page never fetched -- Splice renders
  // its listings on the server -- is looked up with a search of our own.
  const resolver = useMemo(() => new SampleResolver(page.index, runSearch), [page]);

  const pager = useMemo(() => new Pager(), []);
  useEffect(() => pager.start(), [pager]);
  const pages = useSyncExternalStore(pager.subscribe, pager.current);

  const site = useSpliceSite({ resolver, store, actions, toasts, host, openPage: pager.open });

  // Held in a ref rather than depended on: what it closes over changes with
  // every toast and every hover, and the page's furniture must not be torn
  // down and rebuilt each time it does.
  const latest = useRef(site);
  latest.current = site;

  // A logged-out row has nothing to download with and nothing to drag, and a
  // logged-out listing doesn't page at all. Splicedd adds all three.
  const injector = useMemo(
    () => new SiteInjector(perPage => pager.open(withPerPage(perPage)), () => latest.current.saveBatch()),
    [pager]
  );
  useEffect(() => injector.start(), [injector]);

  const listing = useMemo(() => new RowList(fetchJson), []);

  /**
   * Whether anything has been drawn yet in this document. Arriving on a page is
   * not turning one, so the first drawing leaves the scroll alone; every one
   * after it followed a click on the paginator.
   */
  const drawn = useRef(false);

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

        // Every page is drawn here, the first one included. A page Splice
        // served holds the same samples but not the behaviour that goes with
        // them -- its menus, its player and its waveforms are its own -- and a
        // listing that changes hands halfway down is a listing that behaves
        // two different ways.
        if (!listing.owns(result.items)) {
          listing.show(result.items);

          // Turning a page from the paginator at the foot of a very long list
          // would otherwise leave the reader at the foot of it. Arriving is
          // not turning, so the first drawing of a listing leaves it alone.
          if (drawn.current) {
            showListTop();
          }

          drawn.current = true;
        }

        // Which of these are already on disk is worth saying before anything is
        // hovered, and only the search that just landed can answer it.
        void latest.current.survey();
        void latest.current.prepare();
        void rememberSearch(result.records);
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
      {open && <Panel settings={settings} toasts={toasts} onClose={() => setOpen(false)} />}

      {/* Anchored to the viewport rather than the panel, so a toast still shows
          when it's closed -- most of the work happens with it closed. */}
      <div className="sd-dock">
        <ToastStack toasts={toasts.toasts} dismiss={toasts.dismiss} />
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
 * Notes the listing being looked at, so a search whose results were worth
 * something can be returned to. The page number is left out: the search is the
 * search wherever in it the reader happened to be.
 */
function rememberSearch(records: number) {
  const url = new URL(window.location.href);

  url.searchParams.delete("page");
  url.hash = "";

  const query = url.searchParams.get("filepath") ?? url.searchParams.get("query");
  const tags = url.searchParams.getAll("tags").length;

  return searched.add({
    uuid: `${url.pathname}?${url.searchParams}`,
    query: query ?? describe(url, tags),
    url: url.href,
    records
  });
}

/** What to call a listing that nobody typed a query for. */
function describe(url: URL, tags: number) {
  const section = url.pathname.split("/").filter(x => x.length > 0).pop();
  return tags > 0 ? `${section ?? "Samples"} (${tags} tags)` : section ?? "Samples";
}
