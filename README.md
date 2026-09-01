<img src="./icons/icon-128.png" width="64"/>

# Splicedd

**Splicedd** is a Chrome extension that adds a sample browser to
[splice.com](https://splice.com/features/sounds) itself: search with every sort and filter Splice's own
API understands, preview samples, save them to disk, and drag them straight into your DAW.

It needs no account of its own and no desktop app. Because the panel runs inside the Splice page, its
requests are the same ones the site makes, so nothing has to be worked around.

## What it does

- **Drag straight into a DAW.** Grab a row and drop it on Ableton, FL Studio, Bitwig, Logic, a folder —
  anywhere that accepts a dropped file. The sample is decoded and converted before the drop lands.
- **Download.** One click saves a sample under your download folder, in a folder per pack.
- **Decodes what Splice serves.** Previews are scrambled; Splicedd unscrambles them and converts the
  result to a 16-bit WAV, trimming the silence MP3 encoders add so loops start on the beat.
- **Every sort and filter.** Relevance, popularity, recency and random, ascending or descending, plus
  instruments, genres, tags, key and scale, exact or range BPM, one-shots or loops, and per-pack filtering.
- **Preview with waveforms.** Click a waveform to seek. Playing one sample stops the last.
- **Right-click any sample name** on splice.com and pick *Find "..." with Splicedd*.

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
| Download folder | Folder under your browser's download directory. Empty saves samples directly there. |
| Folder per pack | Groups samples by the pack they came from. |
| Format | `WAV` (16-bit, what DAWs want) or `MP3` exactly as Splice encoded it. |
| Trim encoder delay | Drops the silence MP3 encoders prepend, so loops start on the beat. |
| Save when dragging | Also keeps a copy on disk whenever a sample is dragged out. |
| Open with splice.com | Shows the panel as soon as a Splice page loads. |
| Results, theme | Page size, and light or dark. |

## How it works

```
splice.com page
├── content.js ── the panel, in a shadow root
│     ├── searches Splice's GraphQL API from the page itself
│     ├── unscrambles previews and converts them to WAV (Web Audio)
│     └── attaches the file to the drag as a Chromium `DownloadURL`
│
└── background.js ── service worker
      ├── fetches assets whose host refuses the splice.com origin
      ├── saves files through chrome.downloads
      └── offscreen.html mints the blob URLs a worker can't create itself
```

Three details are worth knowing:

- **Running inside the page is the whole trick.** Splice's API sits behind Cloudflare's bot management and
  a CORS policy that only trusts splice.com. A request made from the page satisfies both.
- **A drag payload must be attached synchronously**, so a sample is converted while you hover and press
  the mouse, before the drag begins. If you beat it to it, the panel says so and the next drag works.
- **Nothing leaves your browser.** There's no server, no analytics, no account. The extension talks to
  Splice and to your download folder, and that's all.

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
| `src/splice/` | The Splice domain, free of any browser-extension concern: the search API and its filters, the preview decoder, MP3-to-WAV conversion, sample paths. |
| `src/chrome/` | The extension platform: settings, messaging, and network access. |
| `src/panel/` | The React panel injected into splice.com. |
| `src/background.ts`, `src/offscreen.ts`, `src/content.tsx` | The three entry points the manifest names. |

## Permissions, and why

| Permission | Why |
|---|---|
| `splice.com`, Splice's asset hosts | Search, and fetching the sample previews themselves. |
| `downloads` | Saving samples, and *Show in folder*. |
| `storage` | Your settings. |
| `offscreen` | Building the blob a download needs; a service worker can't. |
| `contextMenus`, `scripting` | The right-click search, and reaching tabs opened before the extension was installed. |

Splicedd downloads the same public preview files splice.com plays in your browser. Previews are not
licensed sample files: if a sample makes it into something you release, license it on Splice.
