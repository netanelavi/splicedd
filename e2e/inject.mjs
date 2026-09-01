// End-to-end check for what Splicedd adds to, removes from and changes on
// splice.com's page.
//
// The page served here is what Splice actually gives a logged-out reader: rows
// whose only actions are a licence button and a heart, no download, no drag
// handle, no paginator -- just an invitation to register where the rest of the
// results would be.

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

const row = filename => `
<div role="presentation" class="asset-row svelte-1aewf11" data-qa="sampleAssetRow">
  <div class="cell cell--playback" role="gridcell">
    <button data-qa="playPausePlaybackButton" class="variant-transparent icon icon-only">play</button>
  </div>
  <div class="cell cell--filename svelte-1aewf11" role="gridcell">
    <div data-qa="asset-filename" class="filename">${filename}</div>
  </div>
  <div class="cell cell--waveform" role="gridcell">
    <button aria-label="play sample" class="invisible svelte-1v7zsf1">
      <div class="waveform" data-qa="sounds.waveform-preview" style="width:160px;height:32px;color:#8f8">
        <canvas width="160" height="32" style="width:160px;height:32px"></canvas>
      </div>
    </button>
  </div>
  <div class="cell cell--actions" role="gridcell">
    <div class="asset-actions svelte-cmmuu7">
      <form class="top-level-action svelte-cmmuu7" action="https://splice.com/plans">
        <button type="button" class="variant-transparent icon-only icon-small" data-qa="license-button">License</button>
        <button type="button" class="variant-transparent icon-only icon-small" data-qa="like-button">Like</button>
      </form>
      <div class="details svelte-12ybw6r">
        <div><button class="menu-opener" aria-haspopup="true">...</button></div>
        <div data-qa="menu-container">
          <div class="menu-panel svelte-12ybw6r" data-qa="menu-panel" role="menu">
            <ul>
              <li role="presentation"><button data-qa="license-button">Get</button></li>
              <li role="presentation"><button data-qa="share-button" role="menuitem">Copy link</button></li>
              <li role="presentation"><a role="menuitem" href="https://splice.com/sounds/sample/${"c".repeat(64)}">Open in new tab</a></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;

const html = `<!doctype html><html lang="en" data-theme="light"><head><title>Search Samples | Splice</title></head>
  <body style="background:#111;color:#eee;font-family:sans-serif">
    <main>
      <div role="grid">${row("prec_p1_0.wav")}${row("prec_p1_1.wav")}</div>
      <div class="remaining-results"><p>Register for full access</p></div>
    </main>
    <div style="height:2500px"></div>
    <section class="faq-section"><h3>FAQs</h3></section>
  </body></html>`;

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
};

const preview = scramble(makeAudio({ seconds: 30 }));
const profile = await mkdtemp(path.join(tmpdir(), "splicedd-inject-"));

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
    const variables = JSON.parse(request.postData() ?? "{}").variables;
    searches.push(variables);

    const response = searchResponse(request.postData() ?? "{}");
    const [first] = response.data.assetsSearch.items;

    // As many samples as were asked for, so a page really is the size it says.
    response.data.assetsSearch.items = Array.from({ length: variables.limit ?? 2 }, (_, i) => ({
      ...first,
      uuid: `sample-${variables.page ?? 1}-${i}`,
      name: `prec_p${variables.page ?? 1}_${i}.wav`,
      // Splice hashes every file it returns, and a row's permalink is that hash.
      files: first.files.map(file => ({ ...file, hash: `${variables.page ?? 1}${i}`.padStart(64, "d") }))
    }));

    return route.fulfill({
      status: 200,
      headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify(response)
    });
  }

  if (url.startsWith(CDN)) {
    if (url.includes("waveform")) {
      return route.fulfill({
        status: 200,
        headers: { ...CORS, "content-type": "application/json" },
        body: JSON.stringify(Array.from({ length: 120 }, (_, i) => Math.abs(Math.sin(i / 5))))
      });
    }

    return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "audio/mpeg" }, body: preview });
  }

  if (url.startsWith("https://splice.com/")) {
    return route.fulfill({ status: 200, contentType: "text/html", body: html });
  }

  return route.continue();
});

await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://splice.com" });

const page = await context.newPage();
page.on("pageerror", err => console.log("   [page exception]", err.message));

await page.goto(PAGE_URL);
await page.waitForFunction(() => document.documentElement.dataset.splicedd == "on", null, { timeout: 15_000 });

// --- the two buttons Splice never drew ---

const first = page.locator('[data-qa="sampleAssetRow"]').first();

await first.locator('[data-qa="download-button"]').waitFor({ timeout: 10_000 }).then(
  () => check("a download button is added to every row", true),
  err => check("a download button is added to every row", false, err.message.split("\n")[0]));

check(
  "both buttons are added, to both rows",
  await page.locator('[data-qa="download-button"]').count() == 2 &&
  await page.locator('[data-qa="drag-button"]').count() == 2
);

check(
  "they lead the row's actions, ahead of Splice's own",
  await first.evaluate(node => [...node.querySelectorAll(".top-level-action > button")]
    .map(x => x.dataset.qa).join(" ")) == "download-button drag-button license-button like-button",
  await first.evaluate(node => [...node.querySelectorAll(".top-level-action > button")]
    .map(x => x.dataset.qa).join(" "))
);

check(
  "the download button carries Splice's own sprite icon",
  await first.locator('[data-qa="download-button"] use').getAttribute("href") == "#icon-file-download"
);

check(
  "the drag handle is drawn rather than borrowed",
  await first.locator('[data-qa="drag-button"] svg').getAttribute("viewBox") == "0 0 24 24" &&
  await first.locator('[data-qa="drag-button"] use').count() == 0
);

// --- the offers to subscribe are taken down ---

check("the register prompt is hidden", !(await page.locator(".remaining-results").isVisible()));
check("the licence buttons are hidden", !(await page.locator('[data-qa="license-button"]').first().isVisible()));

// --- a paginator, built from what Splice's API says the search holds ---

const nav = page.locator('[data-qa="pagination"]');
await nav.waitFor({ timeout: 15_000 }).then(
  () => check("a paginator is added where the register prompt was", true),
  err => check("a paginator is added where the register prompt was", false, err.message.split("\n")[0]));

check(
  "it sits just above the FAQ, as Splice's own would",
  await nav.evaluate(node => node.nextElementSibling?.className) == "faq-section",
  await nav.evaluate(node => node.nextElementSibling?.className)
);

check(
  "it counts the pages from Splice's own answer",
  (await page.locator('[data-qa="pagination-summary"]').textContent()) == "Page 1 of 3",
  await page.locator('[data-qa="pagination-summary"]').textContent()
);

check("there is no page before the first", await page.locator('[data-qa="pagination-first"]').getAttribute("aria-disabled") == "true");
check("the next page is a link to it", (await page.locator('[data-qa="pagination-next"]').getAttribute("href"))?.includes("page=2"));
check("the last page is offered too", (await page.locator('[data-qa="pagination-last"]').getAttribute("href"))?.includes("page=3"));
check("the current page is marked, not linked", await page.locator('[aria-current="page"]').textContent() == "1");
check("the page size is offered", await page.locator('[data-qa="pagination-per-page-select"]').count() == 1);

// --- the added buttons do the extension's work ---

await first.hover();
await page.waitForFunction(
  () => document.querySelector('[data-qa="sampleAssetRow"]')?.dataset.splicedd == "ready",
  null, { timeout: 20_000 }
).then(() => check("hovering an added button's row gets the file ready", true), err =>
  check("hovering an added button's row gets the file ready", false, err.message.split("\n")[0]));

await first.locator('[data-qa="download-button"]').click();

const toast = page.locator(".sd-toast p");
await toast.first().waitFor({ timeout: 20_000 });
check(
  "the added download button saves a decoded WAV",
  /^Saved .*prec_p1_0\.wav$/.test((await toast.first().textContent()) ?? ""),
  await toast.first().textContent()
);

const payload = await page.evaluate(async () => {
  const button = document.querySelector('[data-qa="sampleAssetRow"] [data-qa="drag-button"]');
  const transfer = new DataTransfer();

  button.dispatchEvent(new DragEvent("dragstart", { bubbles: true, composed: true, dataTransfer: transfer }));
  return transfer.getData("DownloadURL");
});

check(
  "the added drag handle hands the DAW a file",
  /^audio\/wav:prec_p1_0\.wav:blob:/.test(payload),
  payload.slice(0, 70)
);

// --- and they survive Splice re-rendering the row ---

await page.evaluate(() => {
  const actions = document.querySelector('[data-qa="sampleAssetRow"] .top-level-action');
  actions.innerHTML = '<button type="button" data-qa="like-button">Like</button>';
});

await page.waitForFunction(
  () => document.querySelector('[data-qa="sampleAssetRow"] [data-qa="download-button"]') != null,
  null, { timeout: 5000 }
).then(() => check("a row re-rendered by Splice gets its buttons back", true), err =>
  check("a row re-rendered by Splice gets its buttons back", false, err.message.split("\n")[0]));

check("naming the page took one search", searches.length == 1, `${searches.length} searches`);

// --- walking the pages ---

// A sentinel that a full page load would wipe.
await page.evaluate(() => { window.__stillHere = true; });

await page.locator('[data-qa="pagination-next"]').click();
await page.waitForURL("**/samples?filepath=prec&page=2", { timeout: 10_000 }).then(
  () => check("the added paginator turns the page", true),
  err => check("the added paginator turns the page", false, err.message.split("\n")[0]));

await page
  .waitForFunction(
    () => document.querySelector('[data-qa="asset-filename"]')?.textContent == "prec_p2_0.wav",
    null, { timeout: 15_000 })
  .then(() => check("Splicedd draws the page Splice won't serve", true), err =>
    check("Splicedd draws the page Splice won't serve", false, err.message.split("\n")[0]));

check("without reloading the document", await page.evaluate(() => window.__stillHere === true));

await page.waitForTimeout(1200);

check(
  "and brings the top of the list back into view",
  await page.evaluate(() => {
    const list = document.querySelector('[data-qa="sampleAssetRow"]').parentElement;
    return Math.abs(list.getBoundingClientRect().top) < 120;
  })
);

// --- a drawn row carries Splice's markup and none of its behaviour ---

const drawn = page.locator("[data-splicedd-row]").first();

check("its menu starts closed", !(await drawn.locator('[data-qa="menu-panel"]').isVisible()));

await drawn.locator(".menu-opener").click();
await drawn.locator('[data-qa="menu-panel"]').waitFor({ state: "visible", timeout: 5000 }).then(
  () => check("the three dots open it anyway", true),
  err => check("the three dots open it anyway", false, err.message.split("\n")[0]));

await drawn.locator('[data-qa="share-button"]').click();
check(
  "and copy link copies the sample's own address",
  (await page.evaluate(() => navigator.clipboard.readText())).includes("/sounds/sample/"),
  await page.evaluate(() => navigator.clipboard.readText())
);

await drawn.locator(".menu-opener").click();
check("clicking the dots again closes it", !(await drawn.locator('[data-qa="menu-panel"]').isVisible()));

check(
  "a drawn row keeps Splice's own waveform canvas",
  await page.locator("[data-splicedd-row] canvas").count() > 0 &&
    await page.locator("[data-splicedd-row] [data-qa='sounds.waveform-preview'] svg").count() == 0
);

await page
  .waitForFunction(() => {
    const canvas = document.querySelector("[data-splicedd-row] canvas");
    const painted = canvas?.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;

    return painted != null && painted.some(x => x != 0);
  }, null, { timeout: 15_000 })
  .then(() => check("and Splicedd paints the waveform into it", true), err =>
    check("and Splicedd paints the waveform into it", false, err.message.split("\n")[0]));

check(
  "the rows it drew are Splice's own markup",
  await page.locator('[data-qa="sampleAssetRow"]').first().evaluate(node =>
    node.className.includes("asset-row") && node.querySelector('[data-qa="drag-button"]') != null)
);

check(
  "the paginator follows to the page it drew",
  (await page.locator('[data-qa="pagination-summary"]').textContent()) == "Page 2 of 3",
  await page.locator('[data-qa="pagination-summary"]').textContent()
);

check(
  "the way back is offered now",
  await page.locator('[data-qa="pagination-prev"]').getAttribute("href") != null
);

// --- a search typed into Splice's own box is followed too ---
//
// Splice renders that itself, so Splicedd doesn't redraw the rows; what it owes
// the new listing is knowing what's on it, so the added buttons keep working.

await page.evaluate(() => {
  history.pushState(null, "", "/sounds/search/samples?filepath=reese");
  document.querySelector('[data-qa="asset-filename"]').textContent = "stale";
});

await page
  .waitForFunction(
    () => document.querySelector('[data-qa="pagination-summary"]')?.textContent == "Page 1 of 3",
    null, { timeout: 15_000 })
  .then(() => check("a search typed on Splice's page is followed", true), err =>
    check("a search typed on Splice's page is followed", false, err.message.split("\n")[0]));

check(
  "the new search is what Splicedd asked Splice for",
  searches.some(x => x.filepath == "reese"),
  JSON.stringify(searches.at(-1)?.filepath)
);

await page.locator('[data-qa="sampleAssetRow"]').first().hover();
await page
  .waitForFunction(
    () => document.querySelector('[data-qa="sampleAssetRow"]')?.dataset.splicedd == "ready",
    null, { timeout: 20_000 })
  .then(() => check("its rows are ready to drag, like any other", true), err =>
    check("its rows are ready to drag, like any other", false, err.message.split("\n")[0]));

// --- changing how many are shown redraws the list ---

await page.evaluate(() => { history.pushState(null, "", "/sounds/search/samples?filepath=prec"); });
await page.waitForTimeout(500);

await page.selectOption('[data-qa="pagination-per-page-select"]', "50");

await page
  .waitForFunction(() => location.search.includes("limit=50"), null, { timeout: 10_000 })
  .then(() => check("changing the page size changes the search", true), err =>
    check("changing the page size changes the search", false, err.message.split("\n")[0]));

await page
  .waitForFunction(() => searches => true, null, { timeout: 100 }).catch(() => {});

await page.waitForTimeout(2500);

check(
  "and asks Splice for that many",
  searches.some(x => x.limit == 50),
  JSON.stringify(searches.map(x => `${x.filepath}:${x.page ?? 1}x${x.limit}`))
);

await page
  .waitForFunction(() => document.querySelectorAll('[data-qa="sampleAssetRow"]').length == 50,
    null, { timeout: 15_000 })
  .then(() => check("and the list redraws at that size", true), err =>
    check("and the list redraws at that size", false,
      `${err.message.split("\n")[0]} -- ${document ? "" : ""}`));

check(
  "the size it shows is the size it asked for",
  await page.locator('[data-qa="pagination-per-page-select"]').inputValue() == "50",
  await page.locator('[data-qa="pagination-per-page-select"]').inputValue()
);

// --- Splicedd's own heart, which needs no account ---

const heart = page.locator('[data-qa="sampleAssetRow"]').first().locator('[data-qa="like-button"]');
await heart.click();

await page
  .waitForFunction(() => document.querySelector("[data-splicedd-liked]") != null, null, { timeout: 10_000 })
  .then(() => check("the heart marks a sample", true), err =>
    check("the heart marks a sample", false, err.message.split("\n")[0]));

const [likeWorker] = context.serviceWorkers();
const marked = await likeWorker.evaluate(async () => (await chrome.storage.local.get("likes")).likes);

check("and it is recorded with what it takes to find again", marked?.length == 1 && marked[0].pack != null,
  JSON.stringify(marked?.[0]));

await heart.click();
await page
  .waitForFunction(() => document.querySelector("[data-splicedd-liked]") == null, null, { timeout: 10_000 })
  .then(() => check("clicking it again unmarks it", true), err =>
    check("clicking it again unmarks it", false, err.message.split("\n")[0]));

// --- saving a whole page at once ---

await heart.click();
await page.waitForTimeout(400);

const batch = page.locator('[data-qa="pagination"] button', { hasText: "Save this page" });
await batch.waitFor({ timeout: 5000 }).then(
  () => check("the paginator offers to save the page", true),
  err => check("the paginator offers to save the page", false, err.message.split("\n")[0]));

await batch.click();

await page
  .waitForFunction(() => {
    const host = document.getElementById("splicedd-panel-host");
    return /Saved \d+ samples/.test(host?.shadowRoot?.querySelector(".sd-toast p")?.textContent ?? "");
  }, null, { timeout: 60_000 })
  .then(() => check("and saves every row on it", true), err =>
    check("and saves every row on it", false, err.message.split("\n")[0]));

check(
  "marking every saved row as already held",
  await page.locator("[data-splicedd-have]").count() == await page.locator('[data-qa="sampleAssetRow"]').count(),
  `${await page.locator("[data-splicedd-have]").count()} of ${await page.locator('[data-qa="sampleAssetRow"]').count()}`
);

// --- what was played, and what was searched for ---

const lists = () => likeWorker.evaluate(async () =>
  chrome.storage.local.get(["played", "searches", "likes", "history"]));

const noted = (await lists()).searches;

check(
  "every listing looked at is noted",
  noted?.length >= 1 && noted.some(x => x.query == "prec" && x.records > 0),
  JSON.stringify(noted?.map(x => `${x.query}:${x.records}`))
);

check(
  "and a page of the same search is the same search",
  new Set(noted.map(x => x.uuid)).size == noted.length,
  JSON.stringify(noted.map(x => x.uuid))
);

await page.locator('[data-qa="sampleAssetRow"]').first()
  .locator('[data-qa="playPausePlaybackButton"]').click();

await page.waitForTimeout(1500);

// --- the waveform follows the sound, and can be clicked along ---

const bar = () => page.evaluate(() => {
  const canvas = document.querySelector("[data-splicedd-row] canvas");
  const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;

  // How solid each end is drawn: what has been played is at full strength,
  // what hasn't is faded, so the two ends straddle the playhead.
  const tenth = Math.floor(canvas.width / 10);
  let left = 0, head = 0, tail = 0;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const alpha = pixels[(y * canvas.width + x) * 4 + 3];

      if (x < canvas.width / 2) left += alpha;
      if (x < tenth) head += alpha;
      if (x >= canvas.width - tenth) tail += alpha;
    }
  }

  return { left, head, tail };
});

await page
  .waitForFunction(() => document.querySelector("[data-splicedd-row-playing]") != null,
    null, { timeout: 10_000 })
  .then(() => check("the row shows it is playing", true), err =>
    check("the row shows it is playing", false, err.message.split("\n")[0]));

const waveform = page.locator("[data-splicedd-row] [data-qa='sounds.waveform-preview']").first();
const box = await waveform.boundingBox();

const seekTo = async fraction => {
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
  await page.waitForTimeout(400);

  return bar();
};

// Near the start almost nothing is drawn solid; near the end the left half is.
const early = await seekTo(0.1);
const late = await seekTo(0.8);

check(
  "clicking along the waveform carries on from there",
  late.left > early.left * 1.5,
  `left ${early.left} -> ${late.left}`
);

check(
  "and what has played is drawn stronger than what hasn't",
  late.head > late.tail * 1.5,
  `head ${late.head} vs tail ${late.tail}`
);

const playhead = page.locator("[data-splicedd-row] .cell--waveform progress").first();

check(
  "Splice's own playhead is under it, in Splice's own class",
  await playhead.count() == 1 && (await playhead.getAttribute("class")) == "svelte-1v7zsf1",
  await playhead.getAttribute("class")
);

check(
  "and it stands where the sound is",
  await playhead.evaluate(node => node.value > 0.6 && node.value <= 1),
  await playhead.evaluate(node => node.value)
);
const heard = (await lists()).played;

check(
  "playing a drawn row notes it",
  heard?.length >= 1 && heard[0].pack != null,
  JSON.stringify(heard?.[0])
);

// --- and all of it is in the panel ---

await likeWorker.evaluate(async () => {
  const [tab] = await chrome.tabs.query({ url: "https://splice.com/*" });
  await chrome.tabs.sendMessage(tab.id, { kind: "settings" });
});

await page.locator(".sd-panel").waitFor({ timeout: 5000 });

for (const tab of ["Saved", "Liked", "Played", "Searches"]) {
  await page.getByRole("tab", { name: tab }).click();

  // Each list is read from storage, so it arrives a tick after the tab does.
  await page.locator(".sd-history-row").first().waitFor({ timeout: 5000 }).catch(() => {});

  const rows = await page.locator(".sd-history-row").count();
  check(`the ${tab} tab lists what it holds`, rows > 0, `${rows} rows`);
}

await context.close();
await rm(profile, { recursive: true, force: true });

const failed = checks.filter(x => !x.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length == 0 ? 0 : 1);
