// End-to-end check for the takeover of splice.com's own UI.
//
// The page served here is Splice's real markup, lifted from a saved copy of
// https://splice.com/sounds/search/samples: the same `data-qa` hooks, the same
// nesting, the same pagination. It is rendered on the "server" and runs no
// JavaScript of its own, which is exactly the case the tap can't help with.

import { chromium } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { CDN, EXTENSION, makeAudio, scramble, searchResponse } from "./fixtures.mjs";

const PAGE_URL = "https://splice.com/sounds/search/samples?filepath=prec";
const GRAPHQL = "https://surfaces-graphql.splice.com/graphql";

const CORS = {
  "access-control-allow-origin": "https://splice.com",
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS"
};

/** Splice's own row, kept structurally identical to the captured markup. */
const row = (filename, hash) => `
<div role="presentation" class="asset-row svelte-1aewf11 sm-three-action" data-qa="sampleAssetRow">
  <div class="cell" role="gridcell" aria-colindex="1">
    <a href="https://splice.com/sounds/packs/x/y" class="pack-art svelte-1aewf11" draggable="false">
      <div class="cover-art svelte-rl7p1"><img data-qa="cover-art-image" src="${CDN}/cover.png" alt=""></div>
    </a>
  </div>
  <div class="cell cell--playback svelte-1aewf11" role="gridcell" aria-colindex="2">
    <div class="playback-controls svelte-1hwz6rn">
      <button data-qa="playPausePlaybackButton" class="variant-transparent size-medium icon icon-only">
        <span class="visually-hidden" data-qa="buttonText">play</span>
      </button>
    </div>
  </div>
  <div class="cell cell--filename svelte-1aewf11" role="gridcell" aria-colindex="3">
    <div data-qa="asset-filename" class="filename">${filename}</div>
    <div class="tags svelte-glqfbv default" data-qa="tags"></div>
  </div>
  <div class="cell cell--waveform svelte-1j1420l" role="gridcell" aria-colindex="4">
    <button aria-label="play sample" class="invisible svelte-1v7zsf1">
      <div class="waveform svelte-gpq5cz" data-qa="sounds.waveform-preview"><canvas width="160" height="32"></canvas></div>
    </button>
  </div>
  <div data-qa="asset-duration" class="cell cell--metadata" role="gridcell" aria-colindex="5">0:06</div>
  <div class="cell cell--metadata" role="gridcell" aria-colindex="6">C#</div>
  <div class="cell cell--metadata" data-qa="bpm" role="gridcell" aria-colindex="7">--</div>
  <div class="cell cell--actions" role="gridcell" aria-colindex="8">
    <div class="asset-actions svelte-cmmuu7">
      <form class="top-level-action svelte-cmmuu7" action="https://splice.com/plans">
        <button type="button" draggable="true" class="variant-transparent icon-only icon-small" data-qa="download-button" title="Download">
          <span class="icon svelte-fv3oar"><svg class="svelte-fv3oar"><use href="#icon-file-download"></use></svg></span>
          <span class="visually-hidden">Download</span>
        </button>
        <button type="button" draggable="true" class="variant-transparent icon-only icon-small" data-qa="drag-button" title="Drag to DAW">
          <span class="icon svelte-fv3oar"><svg class="svelte-fv3oar" viewBox="0 0 24 24"></svg></span>
          <span class="visually-hidden">Drag to DAW</span>
        </button>
        <button aria-haspopup="dialog" class="variant-transparent icon-only icon-small" data-qa="like-button">
          <span class="visually-hidden">Add to likes</span>
        </button>
      </form>
      <div class="details svelte-12ybw6r">
        <div data-qa="menu-container">
          <div class="menu-panel svelte-12ybw6r" data-qa="menu-panel" role="menu" tabindex="0">
            <ul>
              <li role="presentation"><a role="menuitem" href="https://splice.com/sounds/packs/x/y/samples">View Pack</a></li>
              ${hash == null ? "" :
                `<li role="presentation"><a role="menuitem" href="https://splice.com/sounds/sample/${hash}" target="_blank" rel="nofollow">Open in new tab</a></li>`}
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;

const pagination = page => `
<nav class="asset-pagination" data-qa="pagination" role="navigation" aria-label="Pagination">
  <ul>
    <li>${page > 1
      ? `<a class="pagination-page" data-qa="pagination-prev" aria-label="Previous page" href="?filepath=prec&amp;page=${page - 1}">&lsaquo;</a>`
      : `<span class="pagination-page" data-qa="pagination-prev" aria-disabled="true"></span>`}</li>
    <li><span class="pagination-page current" aria-current="page">${page}</span></li>
    <li><a class="pagination-page" data-qa="pagination-next" aria-label="Next page" href="?filepath=prec&amp;page=${page + 1}">&rsaquo;</a></li>
  </ul>
  <label class="pagination-per-page" data-qa="pagination-per-page">
    <span>Per page</span>
    <select class="pagination-per-page__select" data-qa="pagination-per-page-select">
      <option value="10">10</option><option value="25" selected>25</option>
      <option value="50">50</option><option value="100">100</option>
    </select>
  </label>
  <span class="pagination-summary" data-qa="pagination-summary">Page ${page} of 343</span>
</nav>`;

// The fixture names its samples after the search term, so a page reached at
// ?filepath=prec lists exactly what a search for "prec" returns.
const HASHES = { "prec_one.wav": "a".repeat(64) };

const html = page => `<!doctype html><html lang="en"><head><title>Search Samples | Splice</title></head>
  <body style="background:#111;color:#eee;font-family:sans-serif">
    <h1>Sounds</h1>
    <div role="grid">
      ${row("prec_one.wav", HASHES["prec_one.wav"])}
      ${row("prec_two.wav", null)}
    </div>
    ${pagination(page)}
  </body></html>`;

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
};

const preview = scramble(makeAudio());
const profile = await mkdtemp(path.join(tmpdir(), "splicedd-site-"));

const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  executablePath: "/opt/pw-browsers/chromium",
  args: [
    `--disable-extensions-except=${EXTENSION}`,
    `--load-extension=${EXTENSION}`,
    "--autoplay-policy=no-user-gesture-required",
    "--mute-audio"
  ],
  acceptDownloads: true
});

const searches = [];

await context.route("**/*", async route => {
  const request = route.request();
  const url = request.url();

  if (request.method() == "OPTIONS") {
    return route.fulfill({ status: 204, headers: CORS });
  }

  if (url.startsWith(GRAPHQL)) {
    const body = JSON.parse(request.postData() ?? "{}");
    searches.push(body.variables);

    const response = searchResponse(request.postData() ?? "{}");

    // Give the fixture's samples the hash the row's permalink points at, so
    // matching by hash is what identifies the first row.
    for (const item of response.data.assetsSearch.items) {
      const hash = HASHES[item.name];
      if (hash != null) {
        item.files = item.files.map(file => ({ ...file, hash }));
      }
    }

    return route.fulfill({
      status: 200,
      headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify(response)
    });
  }

  if (url.startsWith(CDN)) {
    // With CDN_CORS=0 the asset host refuses the splice.com origin, which
    // forces every asset through the background worker's relay instead.
    const headers = process.env.CDN_CORS == "0"
      ? { "content-type": "audio/mpeg" }
      : { ...CORS, "content-type": "audio/mpeg" };

    return route.fulfill({ status: 200, headers, body: preview });
  }

  if (url.startsWith("https://splice.com/")) {
    const page = parseInt(new URL(url).searchParams.get("page") ?? "1", 10);
    return route.fulfill({ status: 200, contentType: "text/html", body: html(page) });
  }

  return route.continue();
});

const page = await context.newPage();
page.on("pageerror", err => console.log("   [page exception]", err.message));

await page.goto(PAGE_URL);
await page.waitForFunction(() => document.documentElement.dataset.splicedd == "on", null, { timeout: 15_000 });

const rows = page.locator('[data-qa="sampleAssetRow"]');
check("Splice's own rows are on the page", (await rows.count()) == 2, `${await rows.count()} rows`);

// --- a drag works first time, with nothing done to the row beforehand ---

await page.locator('[data-qa="sampleAssetRow"] [data-qa="drag-button"]').first()
  .waitFor({ timeout: 10_000 });

await page
  .waitForFunction(() => document.querySelector('[data-qa="sampleAssetRow"]')?.dataset.splicedd == "ready",
    null, { timeout: 25_000 })
  .then(() => check("the page is made ready without being touched", true), err =>
    check("the page is made ready without being touched", false, err.message.split("\n")[0]));

const cold = await page.evaluate(() => {
  const button = document.querySelector('[data-qa="sampleAssetRow"] [data-qa="drag-button"]');
  const transfer = new DataTransfer();

  button.dispatchEvent(new DragEvent("dragstart", { bubbles: true, composed: true, dataTransfer: transfer }));
  return transfer.getData("DownloadURL");
});

check(
  "and the very first drag hands over a file",
  /^audio\/wav:prec_one\.wav:blob:/.test(cold),
  cold.slice(0, 60)
);

// --- the heart, which needs no account ---

await page.locator('[data-qa="sampleAssetRow"]').first().locator('[data-qa="like-button"]').click();

await page
  .waitForFunction(() => document.querySelector("[data-splicedd-liked]") != null, null, { timeout: 10_000 })
  .then(() => check("Splice's own heart marks it here instead", true), err =>
    check("Splice's own heart marks it here instead", false, err.message.split("\n")[0]));

check(
  "and the mark is visible whatever the sprite is filled with",
  await page.locator("[data-splicedd-liked] [data-qa=\"like-button\"]").evaluate(node => {
    const background = window.getComputedStyle(node).backgroundColor;
    return background != "rgba(0, 0, 0, 0)" && background != "transparent";
  })
);

// --- hovering a row prepares it, using the page's own search ---

const first = rows.first();
await first.hover();

await first.locator('[data-splicedd="ready"], [data-qa="asset-filename"]').first().waitFor({ timeout: 5000 });
await page
  .waitForFunction(() => document.querySelector('[data-qa="sampleAssetRow"]')?.dataset.splicedd == "ready",
    null, { timeout: 20_000 })
  .then(() => check("hovering a Splice row gets its file ready", true), err =>
    check("hovering a Splice row gets its file ready", false, err.message.split("\n")[0]));

check(
  "the page's own address is what Splicedd searched",
  searches.some(x => x.filepath == "prec" && x.page == 1 && x.limit == 25),
  JSON.stringify(searches[0])
);

check("one search named the whole page", searches.length == 1, `${searches.length} searches`);

// --- Splice's download button now saves a decoded WAV ---

await first.locator('[data-qa="download-button"]').click();

const toast = page.locator(".sd-toast p");
await toast.first().waitFor({ timeout: 20_000 });
const saved = (await toast.first().textContent()) ?? "";

check("Splice's download button saves the sample", /^Saved .*prec_one\.wav$/.test(saved), saved);
check("it did not follow Splice to the pricing page", page.url() == PAGE_URL, page.url());

// --- Splice's drag button hands the DAW a file ---

const payload = await page.evaluate(async () => {
  const button = document.querySelector('[data-qa="sampleAssetRow"] [data-qa="drag-button"]');
  const transfer = new DataTransfer();

  button.dispatchEvent(new DragEvent("dragstart", { bubbles: true, composed: true, dataTransfer: transfer }));
  return transfer.getData("DownloadURL");
});

check(
  "Splice's drag button hands the DAW a converted file",
  /^audio\/wav:prec_one\.wav:blob:/.test(payload),
  payload.slice(0, 80)
);

const wav = await page.evaluate(async url => {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const view = new DataView(bytes.buffer);

  return {
    tag: String.fromCharCode(...bytes.subarray(0, 4)) + String.fromCharCode(...bytes.subarray(8, 12)),
    length: bytes.length,
    channels: view.getUint16(22, true),
    rate: view.getUint32(24, true)
  };
}, `blob:${payload.split(":blob:")[1]}`);

check(
  "and that file is a playable 16-bit WAV",
  wav.tag == "RIFFWAVE" && wav.length > 1000 && wav.rate == 44100,
  JSON.stringify(wav)
);

// --- the second row has no permalink, so it is found by its name ---

const second = rows.nth(1);
await second.hover();
await page
  .waitForFunction(() => document.querySelectorAll('[data-qa="sampleAssetRow"]')[1]?.dataset.splicedd == "ready",
    null, { timeout: 20_000 })
  .then(() => check("a row without a permalink is found by its file name", true), err =>
    check("a row without a permalink is found by its file name", false, err.message.split("\n")[0]));

check("naming the page was enough for both rows", searches.length == 1, `${searches.length} searches`);

// --- a page that pages itself is left to do it ---

const own = page.locator('[data-qa="pagination"]');
check("Splice's own paginator is left alone", await own.count() == 1 && await own.evaluate(
  node => !node.hasAttribute("data-splicedd-added")));

await page.locator('[data-qa="pagination-next"]').click();
await page.waitForURL("**/samples?filepath=prec&page=2", { timeout: 10_000 }).then(
  () => check("its next link navigates as Splice meant it to", true),
  err => check("its next link navigates as Splice meant it to", false, err.message.split("\n")[0]));

await page.waitForFunction(() => document.documentElement.dataset.splicedd == "on", null, { timeout: 15_000 });

await page
  .waitForFunction(() => {
    const all = document.querySelectorAll('[data-qa="sampleAssetRow"]');
    return all.length > 0 && [...all].every(row => row.hasAttribute("data-splicedd-row"));
  }, null, { timeout: 20_000 })
  .then(() => check("and Splicedd takes the listing over from the first page", true), err =>
    check("and Splicedd takes the listing over from the first page", false, err.message.split("\n")[0]));

await context.close();
await rm(profile, { recursive: true, force: true });

const failed = checks.filter(x => !x.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length == 0 ? 0 : 1);
