// End-to-end check that a download lands in the chosen folder, at the exact
// path the desktop app would have written -- nested folders and all.
//
// A real directory handle is needed, and the picker can't be driven here, so
// the origin private file system stands in: its handles are the same kind of
// object, storable in IndexedDB in the same way, and readable back afterwards.

import { chromium } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { CDN, EXTENSION, makeAudio, scramble, searchResponse } from "./fixtures.mjs";

const GRAPHQL = "https://surfaces-graphql.splice.com/graphql";
const PAGE_URL = "https://splice.com/sounds/search/samples";

/** A pack and a sample name that both need sanitising, nested two deep. */
const PACK = "Concrete Jungle Drums";
const SAMPLE = "Loops/Deep Cuts/CJD 140 drum loop*full.wav";
const EXPECTED = "Concrete_Jungle_Drums/Loops/Deep_Cuts/CJD_140_drum_loop_full.wav";

const CORS = {
  "access-control-allow-origin": "https://splice.com",
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS"
};

/** A Splice row with nothing on it, so the extension has to add the buttons. */
const PAGE_HTML = `<!doctype html><html><body><h1>Sounds</h1><main><div role="grid">
  <div class="asset-row" data-qa="sampleAssetRow">
    <div class="cell cell--filename"><div data-qa="asset-filename">${SAMPLE.split("/").pop()}</div></div>
    <div class="cell cell--actions"><div class="asset-actions">
      <form class="top-level-action" action="https://splice.com/plans"></form>
    </div></div>
  </div>
</div></main><section class="faq-section"></section></body></html>`;

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
};

const preview = scramble(makeAudio());
let previewFetches = 0;
const profile = await mkdtemp(path.join(tmpdir(), "splicedd-folder-"));

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

await context.route("**/*", async route => {
  const request = route.request();
  const url = request.url();

  if (request.method() == "OPTIONS") {
    return route.fulfill({ status: 204, headers: CORS });
  }

  if (url.startsWith(GRAPHQL)) {
    const response = searchResponse(request.postData() ?? "{}");
    const [item] = response.data.assetsSearch.items;

    item.name = SAMPLE;
    item.parents.items[0].name = PACK;
    response.data.assetsSearch.items = [item];

    return route.fulfill({
      status: 200,
      headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify(response)
    });
  }

  if (url.startsWith(CDN)) {
    // Only the audio counts: a row still draws its cover and its waveform.
    if (url.includes("preview")) {
      previewFetches++;
    }

    return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "audio/mpeg" }, body: preview });
  }

  if (url.startsWith("https://splice.com/")) {
    return route.fulfill({ status: 200, contentType: "text/html", body: PAGE_HTML });
  }

  return route.continue();
});

await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://splice.com" });

const page = await context.newPage();
page.on("pageerror", err => console.log("   [page exception]", err.message));

await page.goto(PAGE_URL);
await page.waitForFunction(() => document.documentElement.dataset.splicedd == "on", null, { timeout: 15_000 });

// The panel reads its folder out of this origin's IndexedDB, which the page
// shares with it -- so seeding it here is the same as having chosen one.
await page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open("splicedd", 1);

  request.onupgradeneeded = () => request.result.createObjectStore("handles");
  request.onerror = () => reject(request.error);
  request.onsuccess = async () => {
    const root = await navigator.storage.getDirectory();
    const store = request.result.transaction("handles", "readwrite").objectStore("handles");
    const write = store.put(root, "download-folder");

    write.onsuccess = () => resolve();
    write.onerror = () => reject(write.error);
  };
}));

const row = page.locator('[data-qa="sampleAssetRow"]').first();
await row.locator('[data-qa="download-button"]').waitFor({ timeout: 15_000 });
await row.locator('[data-qa="download-button"]').click();

const toast = page.locator(".sd-toast p");
await toast.first().waitFor({ timeout: 25_000 });
const message = (await toast.first().textContent()) ?? "";

check("the download reports the folder it went to", message.startsWith("Saved "), message);

check(
  "and doesn't offer to open the blob, which a player would save under an id",
  await page.locator(".sd-toast").first().locator("button", { hasText: "Open" }).count() == 0
);

await page.locator(".sd-toast").first().locator("button", { hasText: "Copy folder" }).click();

check(
  "and to copy the folder it went into, without the file",
  (await page.evaluate(() => navigator.clipboard.readText())) ==
    EXPECTED.split("/").slice(0, -1).join("/"),
  await page.evaluate(() => navigator.clipboard.readText())
);

check(
  "naming the exact path it went to",
  message.endsWith(EXPECTED),
  message
);

// --- and the file really is there, at the nested path ---

const written = await page.evaluate(async expected => {
  const segments = expected.split("/");
  const name = segments.pop();

  let folder = await navigator.storage.getDirectory();

  try {
    for (const segment of segments) {
      folder = await folder.getDirectoryHandle(segment);
    }

    const file = await (await folder.getFileHandle(name)).getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const tag = String.fromCharCode(...bytes.subarray(0, 4)) + String.fromCharCode(...bytes.subarray(8, 12));

    return { found: true, size: file.size, tag };
  } catch (err) {
    // List what is actually there, so a miss says where it went instead.
    const walk = async (dir, prefix) => {
      const seen = [];
      for await (const [key, handle] of dir.entries()) {
        seen.push(...(handle.kind == "directory" ? await walk(handle, `${prefix}${key}/`) : [`${prefix}${key}`]));
      }
      return seen;
    };

    return { found: false, error: `${err.name}`, tree: await walk(await navigator.storage.getDirectory(), "") };
  }
}, EXPECTED);

check(
  "it is written at the exact path the desktop app used",
  written.found,
  written.found ? EXPECTED : `${written.error}; found: ${JSON.stringify(written.tree)}`
);

check(
  "and it is a real WAV, not an empty placeholder",
  written.found && written.tag == "RIFFWAVE" && written.size > 1000,
  JSON.stringify(written)
);

check(
  "no folder of its own was inserted above the pack",
  !message.includes("/Splicedd/") && !message.includes("Splicedd/Concrete"),
  message
);

// --- a sample already in the library is not downloaded again ---

const before = previewFetches;
check("downloading it in the first place fetched the preview", before > 0, `${before} fetches`);

// A fresh page, so nothing is remembered but what is on disk.
await page.reload();
await page.waitForFunction(() => document.documentElement.dataset.splicedd == "on", null, { timeout: 15_000 });

const again2 = page.locator('[data-qa="sampleAssetRow"]').first();
await again2.locator('[data-qa="download-button"]').waitFor({ timeout: 15_000 });
await again2.hover();
await again2.locator('[data-qa="download-button"]').click();

const again = page.locator(".sd-toast p");
await again.first().waitFor({ timeout: 25_000 });
const second = (await again.first().textContent()) ?? "";

check(
  "the second time it says the sample is already there",
  /is already in your library$/.test(second),
  second
);

check(
  "and nothing was downloaded to say so",
  previewFetches == before,
  `${previewFetches - before} extra fetches`
);

const payload = await page.evaluate(async () => {
  const button = document.querySelector('[data-qa="sampleAssetRow"] [data-qa="drag-button"]');
  await new Promise(resolve => setTimeout(resolve, 2500));

  const transfer = new DataTransfer();
  button.dispatchEvent(new DragEvent("dragstart", { bubbles: true, composed: true, dataTransfer: transfer }));

  return transfer.getData("DownloadURL");
});

check(
  "dragging it hands over the copy already on disk",
  /^audio\/wav:CJD_140_drum_loop_full\.wav:blob:/.test(payload) && previewFetches == before,
  `${payload.slice(0, 60)} | ${previewFetches - before} extra fetches`
);

// --- what has been saved is remembered, and dragged straight off disk ---

const [worker] = context.serviceWorkers();
const saved = await worker.evaluate(async () => (await chrome.storage.local.get("history")).history);

check(
  "the save is recorded",
  saved?.length == 1 && saved[0].path == EXPECTED && saved[0].pack == PACK,
  JSON.stringify(saved?.[0])
);

await worker.evaluate(async () => {
  const [found] = await chrome.tabs.query({ url: "https://splice.com/*" });
  await chrome.tabs.sendMessage(found.id, { kind: "settings" });
});

await page.locator(".sd-panel").waitFor({ timeout: 5000 });
await page.getByRole("tab", { name: "Saved" }).click();

const entry = page.locator(".sd-history-row").first();
await entry.waitFor({ timeout: 5000 }).then(
  () => check("and listed under Saved", true),
  err => check("and listed under Saved", false, err.message.split("\n")[0]));

check(
  "with the name it was saved under",
  (await entry.locator("strong").textContent()) == EXPECTED.split("/").pop(),
  await entry.locator("strong").textContent()
);

const beforeDrag = previewFetches;
await entry.hover();
await page.waitForTimeout(800);

const fromDisk = await page.evaluate(async () => {
  const row = document.getElementById("splicedd-panel-host").shadowRoot.querySelector(".sd-history-row");
  const transfer = new DataTransfer();

  row.dispatchEvent(new DragEvent("dragstart", { bubbles: true, composed: true, dataTransfer: transfer }));
  return transfer.getData("DownloadURL");
});

check(
  "and dragging it reads the library, not Splice",
  /^audio\/wav:CJD_140_drum_loop_full\.wav:blob:/.test(fromDisk) && previewFetches == beforeDrag,
  `${fromDisk.slice(0, 55)} | ${previewFetches - beforeDrag} fetches`
);

await context.close();
await rm(profile, { recursive: true, force: true });

const failed = checks.filter(x => !x.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length == 0 ? 0 : 1);
