// End-to-end check of whose listing it is.
//
// Splicedd draws the listing on Splice's search page, and only there: a pack's
// page lists samples in the same rows, but which ones is nowhere in its
// address. And on the search page it only takes over a listing it can
// reproduce -- if Splice's own rows aren't what the search returns, the address
// narrowed them by something Splicedd doesn't understand, and the page is left
// as Splice drew it. Once it is Splicedd's, it stays Splicedd's through Splice
// re-rendering it, a fetch that fails once, and a page of a hundred rows.

import { chromium } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { CDN, EXTENSION, loggedOutPage, makeAudio, scramble, searchResponse } from "./fixtures.mjs";

const SEARCH_URL = "https://splice.com/sounds/search/samples?filepath=prec";
const PACK_URL = "https://splice.com/sounds/packs/concrete/jungle/samples";
const GRAPHQL = "https://surfaces-graphql.splice.com/graphql";

const CORS = {
  "access-control-allow-origin": "https://splice.com",
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS"
};

/** What Splice's server draws for each address. */
const PAGES = {
  [PACK_URL]: ["cjd_kick.wav", "cjd_snare.wav"],
  "https://splice.com/sounds/search/samples?filepath=mismatch": ["other_a.wav", "other_b.wav"]
};

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
};

const failing = (name, ok) => err => check(name, ok, err.message.split("\n")[0]);

const preview = scramble(makeAudio({ seconds: 1.5 }));
const profile = await mkdtemp(path.join(tmpdir(), "splicedd-listing-"));

const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  executablePath: "/opt/pw-browsers/chromium",
  args: [
    `--disable-extensions-except=${EXTENSION}`,
    `--load-extension=${EXTENSION}`,
    "--autoplay-policy=no-user-gesture-required",
    "--mute-audio"
  ]
});

const searches = [];
const fetched = new Map();

/** Previews that fail the first time they are asked for, and only the first. */
const flaky = new Set(["preview-p1-1.mp3"]);

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
    const page = variables.page ?? 1;
    const query = variables.filepath ?? "";

    // A file name asked for by name is answered with that very sample; a
    // search is answered with as many samples as it asked for.
    response.data.assetsSearch.items = query.endsWith(".wav")
      ? [{ ...first, uuid: `named-${query}`, name: query }]
      : Array.from({ length: variables.limit ?? 2 }, (_, i) => ({
        ...first,
        uuid: `sample-${query}-${page}-${i}`,
        name: `${query}_p${page}_${i}.wav`,
        files: first.files.map(file => ({
          ...file,
          url: file.url.replace(/preview-\d+/, `preview-p${page}-${i}`),
          hash: `${page}${i}`.padStart(64, "d")
        }))
      }));

    return route.fulfill({
      status: 200,
      headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify(response)
    });
  }

  if (url.startsWith(CDN)) {
    const file = url.split("/").pop();
    fetched.set(file, (fetched.get(file) ?? 0) + 1);

    if (url.includes("waveform")) {
      return route.fulfill({
        status: 200,
        headers: { ...CORS, "content-type": "application/json" },
        body: JSON.stringify(Array.from({ length: 120 }, (_, i) => Math.abs(Math.sin(i / 5))))
      });
    }

    if (flaky.delete(file)) {
      return route.fulfill({ status: 500, headers: CORS, body: "not right now" });
    }

    return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "audio/mpeg" }, body: preview });
  }

  if (url.startsWith("https://splice.com/")) {
    const served = PAGES[url.split("#")[0]] ?? ["prec_p1_0.wav", "prec_p1_1.wav"];
    return route.fulfill({ status: 200, contentType: "text/html", body: loggedOutPage(served) });
  }

  return route.continue();
});

const page = await context.newPage();
page.on("pageerror", err => console.log("   [page exception]", err.message));

const ready = () => page.waitForFunction(() => document.documentElement.dataset.splicedd == "on", null, { timeout: 15_000 });

const rowState = () => page.evaluate(() => [...document.querySelectorAll('[data-qa="sampleAssetRow"]')].map(row => ({
  name: row.querySelector('[data-qa="asset-filename"]')?.textContent?.trim(),
  drawn: row.hasAttribute("data-splicedd-row"),
  state: row.dataset.splicedd ?? null
})));

// --- a pack's page is Splice's to draw ---

await page.goto(PACK_URL);
await ready();

await page.locator('[data-qa="sampleAssetRow"] [data-qa="download-button"]').first().waitFor({ timeout: 10_000 }).then(
  () => check("a pack page's rows get the buttons", true),
  failing("a pack page's rows get the buttons", false));

await page.waitForTimeout(2500);

let rows = await rowState();
check("but its listing is left as Splice drew it", rows.every(row => !row.drawn && row.name.startsWith("cjd_")), JSON.stringify(rows.map(x => x.name)));
check("with no paginator", await page.locator('[data-qa="pagination"]').count() == 0);
check("and no search run for it", searches.length == 0, `${searches.length} searches`);

await page.locator('[data-qa="sampleAssetRow"]').first().hover();
await page.waitForFunction(
  () => document.querySelector('[data-qa="sampleAssetRow"]')?.dataset.splicedd == "ready",
  null, { timeout: 15_000 }
).then(() => check("a row on it is named on demand, and made ready", true),
  failing("a row on it is named on demand, and made ready", false));

check(
  "by its own file name, in one search",
  searches.length == 1 && searches[0].filepath == "cjd_kick.wav",
  JSON.stringify(searches.map(x => x.filepath))
);

const packPayload = await page.evaluate(() => {
  const button = document.querySelector('[data-qa="sampleAssetRow"] [data-qa="drag-button"]');
  const transfer = new DataTransfer();

  button.dispatchEvent(new DragEvent("dragstart", { bubbles: true, composed: true, dataTransfer: transfer }));
  return transfer.getData("DownloadURL");
});

check("and dragged into a DAW from there", /^audio\/wav:cjd_kick\.wav:blob:/.test(packPayload), packPayload.slice(0, 60));

// --- a search whose page disagrees with its answer is left alone ---

searches.length = 0;
await page.goto("https://splice.com/sounds/search/samples?filepath=mismatch");
await ready();

await page.locator(".sd-toast p").first().waitFor({ timeout: 15_000 }).then(
  () => check("a listing Splicedd can't reproduce is explained", true),
  failing("a listing Splicedd can't reproduce is explained", false));

check(
  "in so many words",
  /can't page this listing/.test((await page.locator(".sd-toast p").first().textContent()) ?? ""),
  await page.locator(".sd-toast p").first().textContent()
);

rows = await rowState();
check("and Splice's rows are left standing", rows.every(row => !row.drawn && row.name.startsWith("other_")), JSON.stringify(rows.map(x => x.name)));
check("without a paginator that couldn't page them", await page.locator('[data-qa="pagination"]').count() == 0);
check("their buttons still added", await page.locator('[data-qa="download-button"]').count() == 2);

// --- the search page is Splicedd's, and stays so ---

searches.length = 0;

// The pointer is parked well below the rows first. Chrome re-hovers whatever
// appears under a resting cursor, and a hover is a request to have the row
// ready -- which is exactly what the next check needs not to have happened.
await page.mouse.move(1200, 700);
await page.goto(SEARCH_URL);
await ready();

await page.waitForFunction(
  () => [...document.querySelectorAll('[data-qa="sampleAssetRow"]')].every(row => row.hasAttribute("data-splicedd-row")),
  null, { timeout: 15_000 }
).then(() => check("the search page's listing is taken over from the first page", true),
  failing("the search page's listing is taken over from the first page", false));

await page.locator('[data-qa="pagination"]').waitFor({ timeout: 10_000 }).catch(() => {});

check(
  "the page size offered is the page's own",
  await page.locator('[data-qa="pagination-per-page-select"]').evaluate(select =>
    select.value == "2" && [...select.options].some(option => option.value == "2")),
  await page.locator('[data-qa="pagination-per-page-select"]').evaluate(select => select.value)
);

// --- a fetch that fails once is tried again ---
//
// Checked before the pointer has been anywhere near the rows: crossing one
// is enough to have it asked for again.

await page.waitForFunction(
  () => document.querySelectorAll('[data-qa="sampleAssetRow"]')[0]?.dataset.splicedd == "ready",
  null, { timeout: 15_000 }
).catch(() => {});

await page.waitForTimeout(1500);

rows = await rowState();
check(
  "a row whose preview was refused is not marked ready",
  rows[0]?.state == "ready" && rows[1]?.state != "ready",
  JSON.stringify(rows.map(x => x.state))
);

await page.locator('[data-qa="sampleAssetRow"]').nth(1).hover();
await page.waitForFunction(
  () => document.querySelectorAll('[data-qa="sampleAssetRow"]')[1]?.dataset.splicedd == "ready",
  null, { timeout: 15_000 }
).then(() => check("reaching for it asks again, and this time it is", true),
  failing("reaching for it asks again, and this time it is", false));

check("the preview was fetched twice, not served from the failure", fetched.get("preview-p1-1.mp3") == 2, `${fetched.get("preview-p1-1.mp3")} fetches`);

// --- a drawn row's menu, dismissed by a click anywhere else ---

const drawn = page.locator("[data-splicedd-row]").first();
await drawn.locator(".menu-opener").click();
await drawn.locator('[data-qa="menu-panel"]').waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
await page.locator("section.faq-section").click();
check("a drawn row's menu closes when the reader clicks elsewhere", !(await drawn.locator('[data-qa="menu-panel"]').isVisible()));

// --- Splice re-rendering its own rows under the same address ---

const before = searches.length;

await page.evaluate(html => {
  const grid = document.querySelector('[data-qa="sampleAssetRow"]').parentElement;
  const fresh = new DOMParser().parseFromString(html, "text/html");

  grid.replaceChildren(...fresh.querySelectorAll('[data-qa="sampleAssetRow"]'));
}, loggedOutPage(["prec_p1_0.wav", "prec_p1_1.wav"]));

await page.waitForFunction(
  () => {
    const rows = [...document.querySelectorAll('[data-qa="sampleAssetRow"]')];
    return rows.length == 2 && rows.every(row => row.hasAttribute("data-splicedd-row"));
  },
  null, { timeout: 10_000 }
).then(() => check("rows Splice re-renders under the same address are drawn over again", true),
  failing("rows Splice re-renders under the same address are drawn over again", false));

check("from the answer already held", searches.length == before, `${searches.length - before} more searches`);
check("with the paginator still in place", await page.locator('[data-qa="pagination"]').count() == 1);

await page.waitForFunction(
  () => [...document.querySelectorAll('[data-qa="sampleAssetRow"]')].every(row => row.dataset.splicedd == "ready"),
  null, { timeout: 15_000 }
).then(() => check("and every row made ready again", true), failing("and every row made ready again", false));

// --- a page of a hundred rows, every one of them ready ---

await page.goto(`${SEARCH_URL}&limit=100`);
await ready();

await page.waitForFunction(
  () => document.querySelectorAll("[data-splicedd-row]").length == 100,
  null, { timeout: 20_000 }
).then(() => check("a hundred rows are drawn when a hundred are asked for", true),
  failing("a hundred rows are drawn when a hundred are asked for", false));

await page.waitForFunction(
  () => {
    const rows = [...document.querySelectorAll("[data-splicedd-row]")];
    return rows.length == 100 && rows.every(row => row.dataset.splicedd == "ready");
  },
  null, { timeout: 90_000 }
).then(() => check("and every one of them is made ready", true), failing("and every one of them is made ready", false));

const firstPayload = await page.evaluate(() => {
  const button = document.querySelector('[data-splicedd-row] [data-qa="drag-button"]');
  const transfer = new DataTransfer();

  button.dispatchEvent(new DragEvent("dragstart", { bubbles: true, composed: true, dataTransfer: transfer }));
  return transfer.getData("DownloadURL");
});

check(
  "the first row still drags once the last is ready",
  /^audio\/wav:prec_p1_0\.wav:blob:/.test(firstPayload),
  firstPayload.slice(0, 60) || "(nothing attached)"
);

// --- the panel closes on Escape ---

const [worker] = context.serviceWorkers().length > 0 ? context.serviceWorkers() : [await context.waitForEvent("serviceworker")];

await worker.evaluate(async () => {
  const [tab] = await chrome.tabs.query({ url: "https://splice.com/*" });
  await chrome.tabs.sendMessage(tab.id, { kind: "settings" });
});

await page.locator(".sd-panel").waitFor({ timeout: 5000 }).catch(() => {});
await page.keyboard.press("Escape");
await page.waitForFunction(() => document.getElementById("splicedd-panel-host")?.shadowRoot?.querySelector(".sd-panel") == null, null, { timeout: 5000 }).then(
  () => check("Escape closes the panel", true),
  failing("Escape closes the panel", false));

await context.close();
await rm(profile, { recursive: true, force: true });

const failed = checks.filter(x => !x.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length == 0 ? 0 : 1);
