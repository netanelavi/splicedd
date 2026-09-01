<img src="./icons/icon-128.png" width="64"/>

# Splicedd

**Splicedd** is a Chrome extension that makes [splice.com](https://splice.com/features/sounds) work the way
you want it to. Splice's own download button and *Drag to DAW* handle start doing the real thing, on
Splice's own pages — and a panel is there too, with every sort and filter Splice's API understands.

It needs no account of its own and no desktop app. Because it runs inside the Splice page, its requests
are the same ones the site makes, so nothing has to be worked around.

## What it does

- **Drag straight into a DAW.** Grab a row and drop it on Ableton, FL Studio, Bitwig, Logic, a folder —
  anywhere that accepts a dropped file. The sample is decoded and converted before the drop lands.
- **A download button and a drag handle on every row.** A logged-out Splice row has neither — just a
  licence button and a heart. Splicedd adds both, in Splice's own markup and using Splice's own sprite:
  the download saves a decoded WAV, and the drag hands your DAW the file rather than a link to Splice's
  desktop app. Where Splice draws its own (a subscriber's row), those are taken over instead, and holding
  <kbd>Alt</kbd> while clicking still reaches Splice's, which is the licensed file.
- **Paging that actually pages.** A logged-out listing shows one page and ends in an invitation to
  register; asking Splice's server for `?page=2` returns the first page again. So Splicedd asks Splice's
  API how far the search really runs, builds the paginator Splice would have — first, previous, numbered
  pages, next, last, page size, *Page N of M* — and draws each page itself, in Splice's own row markup,
  without a reload. A stepper stays in view so you never walk to the foot of the list to turn a page.
- **The sign-up prompts taken down.** The `+` that licenses a sample with a credit, the *+ N more samples*
  standing in for the rest of the results with *Register for full access* under it, the marketing footer,
  and the *Rare Finds* button that looks like a filter but opens a blog post. It's a stylesheet rule
  rather than a deletion, so the *Hide the upsells* setting puts them straight back — which is what a
  subscriber wants, since the licence button is how a sample is bought. The navigation bar and the row
  menus are left alone.
- **Follows Splice's own player.** Play anything on splice.com — a pack page, a rail, the search you were
  already using — and a card appears with that sample, ready to drag or download. Splicedd reads it out of
  the responses Splice already sent the page, so it costs no request of its own.
- **Saves where you say, under its own name.** Point Splicedd at a folder once and every sample is written
  straight into it, at exactly the path the desktop app used — `Pack_Name/sample_name.wav`, nested as
  deeply as the name goes. A sample already there is left alone and reused, so nothing is downloaded,
  decoded or written twice. Without a chosen folder, files go to the browser's download folder, in a
  folder of their own — where the browser gets the last word on the name.
- **Decodes what Splice serves.** Previews are scrambled; Splicedd unscrambles them and converts the
  result to a 16-bit WAV, trimming the silence MP3 encoders add so loops start on the beat.
- **Every sort and filter.** Relevance, popularity, recency and random, ascending or descending, plus
  instruments, genres, tags, key and scale, exact or range BPM, one-shots or loops, and per-pack filtering.
- **Preview with waveforms.** Click a waveform to seek. Playing one sample stops the last.
- **Right-click any sample name** on splice.com and pick *Find "..." with Splicedd*, or right-click the
  toolbar icon for *Splicedd settings* — which opens splice.com if you aren't there yet, and lands on them.

## Installing

Chrome doesn't allow installing an extension from a file, so it's loaded unpacked:

```bash
yarn install
yarn build
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked** and pick the `dist/` folder.
3. Open [splice.com](https://splice.com/sounds/search/samples). The Splicedd tab appears on the right edge —
   click it, press <kbd>Alt</kbd>+<kbd>S</kbd>, or click the toolbar icon.

Works in any Chromium browser with Manifest V3 support: Chrome, Edge, Brave, Opera, Arc.

## Settings

The gear in the panel header holds:

| Setting | What it does |
|---|---|
| Save samples to | A folder you pick. Splicedd writes into it directly, so names and folders are exact. |
| Folder in your downloads | Only used when no folder is chosen, since your downloads hold everything else too. |
| Folder per pack | Groups samples by the pack they came from. |
| Format | `WAV` (16-bit, what DAWs want) or `MP3` exactly as Splice encoded it. |
| Trim encoder delay | Drops the silence MP3 encoders prepend, so loops start on the beat. |
| Save when dragging | Also keeps a copy on disk whenever a sample is dragged out. |
| Open with splice.com | Shows the panel as soon as a Splice page loads. |
| Hide the upsells | Takes down Splice's subscribe prompts. Off keeps the licence buttons. |
| Block analytics | Stops splice.com reporting what you browse and play to its trackers. |
| Results, theme | Page size, and light or dark. |

## How it works

```
splice.com page
├── tap.js ── in the page's own JavaScript world
│     └── wraps fetch, and forwards a copy of what Splice asks for
│
├── content.js ── the panel, in a shadow root
│     ├── adds a download button and a drag handle to every row
│     ├── draws the pages Splice won't serve, in Splice's own markup
│     ├── names the sample the page is playing, from what the tap saw
│     ├── searches Splice's GraphQL API from the page itself
│     ├── unscrambles previews and converts them to WAV (Web Audio)
│     └── attaches the file to the drag as a Chromium `DownloadURL`
│
└── background.js ── service worker
      ├── fetches assets whose host refuses the splice.com origin
      ├── saves files through chrome.downloads
      └── offscreen.html mints the blob URLs a worker can't create itself
```

Five details are worth knowing:

- **Running inside the page is the whole trick.** Splice's API sits behind Cloudflare's bot management and
  a CORS policy that only trusts splice.com. A request made from the page satisfies both.
- **Watching beats asking.** Splice signs a fresh preview URL into every response it sends its own player.
  Reading those responses as they arrive means Splicedd already holds the URL for anything you play, knows
  exactly what you're looking at, and adds no traffic. The tap returns every response to the page
  untouched; it copies, it never intercepts.
- **One file knows Splice's markup.** `src/page/site.ts` reads the `data-qa` hooks Splice puts on its own
  UI for its tests — `sampleAssetRow`, `download-button`, `drag-button`, `asset-filename`, the pagination.
  Class names are Svelte build hashes that change with every deploy; these describe what the element *is*.
  Nothing is bound to a row either: the listeners sit on the document and work out what they're looking at
  when an event arrives, so Splice can re-render, paginate and navigate freely. A row Splice rendered on
  its server, which no `fetch` ever carried, is named by running the search the page's own address
  describes — one request for the whole page, and only once the user reaches for a row.
- **A drag payload must be attached synchronously**, so a sample is converted while you hover and press
  the mouse, before the drag begins. If you beat it to it, the panel says so and the next drag works.
- **Nothing leaves your browser.** There's no server, no analytics, no account. The extension talks to
  Splice and to your download folder, and that's all — and with *Block analytics* on, Splice's own
  trackers don't get to talk either. That's a `declarativeNetRequest` ruleset rather than anything in the
  page, so it covers a beacon sent on unload and a tracking pixel as well as a `fetch`, and it runs before
  any of Splice's code does. Every rule is scoped to requests splice.com starts; nothing else you browse
  is touched.

## Development

```bash
yarn dev         # rebuild on change; reload the extension in chrome://extensions
yarn build       # production build into dist/
yarn typecheck   # tsc --noEmit
yarn zip         # a packaged splicedd-chrome-extension.zip
```

Source layout:

| Path | |
|---|---|
| `src/splice/` | The Splice domain, free of any browser-extension concern: the search API and its filters, reading samples out of a response, the preview decoder, MP3-to-WAV conversion, sample paths. |
| `src/page/` | splice.com itself: the tap that watches its requests from the page's own world, the index of what it has been sent, the one module that knows its markup, and what Splicedd adds to it — the row buttons, the paginator, the listing it draws and the player behind it. |
| `src/chrome/` | The extension platform: settings, messaging, network access, and the folder samples are written to. |
| `src/panel/` | The React panel injected into splice.com. |
| `src/background.ts`, `src/offscreen.ts`, `src/content.tsx`, `src/page/tap.ts` | The four entry points the manifest names. |

## Permissions, and why

| Permission | Why |
|---|---|
| `splice.com`, Splice's asset hosts | Search, and fetching the sample previews themselves. |
| `downloads` | Saving samples, and *Show in folder*. |
| `storage` | Your settings. |
| `offscreen` | Building the blob a download needs; a service worker can't. |
| `contextMenus`, `scripting` | The right-click search, the settings entry on the toolbar icon, and reaching tabs opened before the extension was installed. |
| `declarativeNetRequest` | Blocking splice.com's analytics. Block rules need no access to the hosts they block, and none is asked for. |

Splicedd downloads the same public preview files splice.com plays in your browser. Previews are not
licensed sample files: if a sample makes it into something you release, license it on Splice.
