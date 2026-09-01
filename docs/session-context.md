# Splicedd: where the work stands

Written so a fresh session can pick the work up without the conversation that produced it. It says what
was built, why each decision went the way it did, what is known to be impossible, and what is left.

Branch `claude/chrome-extension-daw-files-wbyfgm`, pull request **#1**, open and mergeable. There is no CI
on pull requests in this repository, so the end-to-end runs below are the only gate.

## The task, and the rules it is held to

Turn the Splicedd desktop app (Tauri, deleted) into a Chrome extension that lives inside splice.com:
downloading samples, dragging straight into a DAW, Splice's own decryption and decoding, and every sort
and filter. The extension is the only thing that matters; nothing else in the repository is kept for the
desktop app's sake.

Standing instruction, applied to every change: **SOLID, clean code, simplicity, DRY.** In practice that
has meant three habits worth keeping:

- **Do as little as possible, and let Splice do the rest.** Splice's markup, classes, stylesheet and
  player already exist. A row Splicedd draws is a copy of a row Splice drew; a paginator Splicedd builds
  wears Splice's classes; the playhead is Splice's own `progress` element. Nothing is reimplemented that
  the page will do if asked.
- **Knowledge of Splice's markup lives in exactly one file** — `src/page/site.ts`. Every `data-qa` hook,
  class name and selector is there, and nothing else in the codebase queries the page directly.
- **Nothing is bound to a row.** Listeners sit on the document in the capture phase and work out what they
  are looking at when an event arrives, so Splice may re-render, paginate and navigate freely.

## What was asked for, in the order it was asked

Every one of these is implemented and shipped.

1. Intercept Splice's own traffic instead of issuing separate searches.
2. Apply the extension's logic onto Splice's real UI — download button, drag handle, pages — with the
   uploaded `.mhtml` of the search page as the source of selectors.
3. Keep Splice's row menus and its navigation bar, log-in and try-now buttons. (This overrode part of the
   earlier "account edits" spec, which had called for removing them.)
4. Paging does not work on splice.com by itself, so implement it: draw the pages, copy the desktop app's
   whole search-and-redisplay mechanism, and lean on the page's own JavaScript to do as little as possible.
5. Fix the malformed manifest match pattern that stopped the extension loading.
6. Fix the panel's blacked-out text; download to a chosen folder with the right name and folder structure.
7. Reach the settings from the extension itself.
8. Block the analytics and "collect" requests.
9. Drop the side panel — settings only — and cut the settings to the minimum.
10. Make Splice's three-dot menu and its heart work; remove the floating pager.
11. Implement every remaining feature that was proposed, plus a history page: recently downloaded,
    recently played, and a query history.
12. Splicedd's own "liked", since Splice's needs an account.
13. Fix: drawn pages missing Splice's waveform, hearts that looked dead, drag failing before a download.
14. Put a link to the saved file's location in the toast; drop the "now playing" card; take the listing
    over from page one.
15. A copy-path button (the folder, without the file), and a waveform that animates, shows the position
    and can be clicked to play from that point.

## How it is built

```
splice.com page
├── tap.js ── the page's own JavaScript world (MAIN)
│     └── wraps fetch and forwards a copy of what Splice asks for
│
├── content.js ── the work, plus a settings panel in a shadow root
│     ├── adds a download button and a drag handle to every row
│     ├── draws the pages Splice won't serve, in Splice's own markup
│     ├── unscrambles previews and converts them to WAV (Web Audio)
│     └── attaches the file to the drag as a Chromium DownloadURL
│
└── background.js ── service worker
      ├── fetches assets whose host refuses the splice.com origin
      ├── saves files through chrome.downloads
      └── offscreen.html mints the blob URLs a worker can't create itself
```

### `src/splice/` — the domain, free of any extension concern

| File | |
|---|---|
| `api.ts` | The search API, its filters, and `SpliceSample` / `SpliceSamplePack`. |
| `harvest.ts` | Shape-driven `harvestSamples(payload)` — finds samples anywhere in a response without knowing its schema. `previewKey(url)` is gated by `isSpliceHost`, which doubles as the safety filter against forged `postMessage`s. |
| `audio.ts` | `decodeSpliceAudio` — Splice's XOR-scrambled previews — then `decodeAudioData` and a 16-bit WAV encoder, trimming the 1200-frame encoder delay so loops start on the beat. |
| `paths.ts` | `samplePath(sample)` → `Pack_Name/sample_name.wav`. Verified character-for-character against the desktop app's `sanitizePath` on five cases; do not "improve" it without checking the same. |

### `src/page/` — splice.com itself

| File | |
|---|---|
| `tap.ts` | MAIN world. Wraps `window.fetch`, takes the response clone in the first continuation (before the page reads it), forwards `.mp3` URLs and `/graphql` bodies over `postMessage`. It copies; it never blocks. |
| `protocol.ts` | The one message shape crossing the two worlds. |
| `site.ts` | **The only file that knows Splice's markup.** `QA` hooks, `CLASSES`, `rowOf`, `rows`, `pagination`, `perPage`, the row marks, `menuToggledBy`, `sharedBy`, `playedBy`, `seekedBy`, `showListTop`, `followPageTheme`, `setUpsellsHidden`, and `SITE_STYLES`. |
| `list.ts` | `RowList` — clones one of Splice's rows as a template and refills copies of it. `showProgress` repaints Splice's canvas two-tone and maintains Splice's `progress` bar. |
| `inject.ts` | `SiteInjector` — the row buttons, the paginator, the per-page select and *Save this page*, all in Splice's classes, behind a rAF-debounced MutationObserver. |
| `pager.ts` | Page state and `open(href)` — `history.pushState` and reread, because Splice's server answers `?page=` with page one. |
| `location.ts` | `filtersFromLocation` — Splice's query parameters are named after its own GraphQL variables, so the page's address *is* the search. |
| `resolver.ts` | Names a row: index, then the search the page's address describes, then per-filename. |
| `sampleIndex.ts` | What the tap has seen, by preview URL, hash and name. |
| `player.ts` | One `<audio>`, reporting on every frame rather than on `timeupdate`. |
| `observer.ts` | Page-change notification. |

### `src/chrome/` — the extension platform

`settings.ts` (four settings, no React), `folder.ts` (File System Access plus IndexedDB for the handle),
`lists.ts` (`saved` 500, `liked` 500, `played` 200, `searched` 50), `net.ts`, `messages.ts`, `assets.ts`.

### `src/panel/` — what runs in the page

`App.tsx` owns the store, the toasts, the actions, the observer, the pager, the resolver, the injector and
the row list. `hooks/useSpliceSite.ts` is the site glue — every document listener, the background prepare
queue, the keys. `hooks/useSampleActions.ts` is what happens to a sample. `sampleStore.ts` caches, and
reads a file off disk before ever fetching it again. `Panel.tsx` is settings plus the four lists.

## Decisions, and why they went that way

- **Watching beats asking.** Splice signs a fresh preview URL into every response it sends its own player.
  Reading those responses costs no extra traffic and gets the URL for free.
- **`data-qa` hooks are the contract.** Class names are Svelte build hashes and go stale on any deploy;
  the hooks describe what an element *is*. Where a class is needed anyway (Splice's `progress`), the
  injected stylesheet stands the element up on its own so a stale hash degrades rather than breaks.
- **Splice renders listings on its server**, so a fresh load gives the tap nothing. Hence the resolver's
  three steps, and hence the listing being taken over from page one: a list that changed hands halfway
  down would behave two different ways.
- **`?page=2` returns page one when logged out**, which is why Splicedd draws every page itself.
- **The waveform behaviour was verified, not invented.** The MHTML's stylesheet carries
  `.waveform … canvas { cursor: pointer }` and a `progress` at 3px in the site accent with a 12px hit
  area; `git show 9daf4fc:src/ui/components/Waveform.tsx` shows the desktop app had click-to-seek,
  arrow-key seek, ARIA slider semantics and a two-tone fill. Both are implemented.

## Known impossibilities — say so rather than attempting them again

- **A drag carries one file.** Chromium's `DataTransfer.setData("DownloadURL", …)` takes a single
  `mime:filename:url`, and the payload must be attached synchronously in `dragstart`. Multi-sample drag
  cannot exist; *Save this page* is the answer to it.
- **A folder chosen through the File System Access picker has no path.** It exposes a name and a handle,
  never a location on disk, and cannot be revealed in the file manager. Hence *Open* and *Copy folder*
  for a chosen folder, and *Show in folder* only for a browser download.
- **Splice's real "like" needs an account.** Implementing the mutation would need a HAR of a like request
  taken while logged in. Until then Splicedd keeps its own list, and Alt-click still reaches Splice's.

## Traps already fallen into

- `https://spliceproduction.s3.*.amazonaws.com/*` is **malformed**: Chrome allows `*` only as a whole
  leading label. It is `https://*.amazonaws.com/*`.
- The panel host carries inline `all: initial`, which beats `:host`. Inherited properties belong on
  `.sd-shadow` inside the shadow root. (Custom properties are exempt from `all`.)
- Advertising the blob as `text/uri-list` made DAWs download it and name it a UUID. Only `DownloadURL`
  and `text/plain` are set.
- A hook returning a fresh object every render rebuilt the injector constantly and tore the injected
  furniture out of the DOM. `useSpliceSite` and `useSampleActions` both `useMemo` their return; `App`
  keeps a `latest` ref.
- Splice's heart is a sprite with its own fill, so colouring the button shows nothing — the mark is a
  ring behind it.
- `cloneNode` does not clone listeners, which is exactly why the document-level listeners matter.
- A root handle whose `name` is empty produced a leading `/` in the reported path.

## The end-to-end runs

`e2e/` holds six suites — **106 checks** — run against a route-mocked https://splice.com with the built
extension loaded. They are the gate on every change; run them all before pushing.

```bash
yarn build
cd e2e && npm install     # once
npm test                  # all six, about six minutes
CDN_CORS=0 node site.mjs  # again, forcing the worker relay path
```

| Suite | | |
|---|---|---|
| `inject.mjs` | 58 | The buttons, the paginator, the drawn pages, the keys, the lists, the toasts. |
| `site.mjs` | 17 | Naming a server-rendered row, the menu, the heart, navigation. Honours `CDN_CORS=0`. |
| `folder.mjs` | 15 | The chosen folder, paths, reuse of a file already on disk, dragging off disk. |
| `tap.mjs` | 5 | The MAIN-world tap and the bridge. |
| `privacy.mjs` | 8 | Each blocked tracker, and the setting putting them back. |
| `settings.mjs` | 3 | The panel opening and its controls. |

`fixtures.mjs` builds the fake Splice responses and exports `EXTENSION`, the built `dist/` next door.

## What is left

Nothing outstanding was asked for. Two things were offered and not taken up:

- Splice's real like, which needs a logged-in HAR of a like request.
- A per-row selection UI beyond the <kbd>x</kbd> key.

The pull request is watched, so a comment or a CI event wakes the session that owns it.
