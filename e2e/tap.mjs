// End-to-end check for the interception: the fake splice.com makes Splice's own
// requests, and the panel has to notice them without being told.

import { chromium } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { CDN, EXTENSION, makeAudio, scramble, searchResponse } from "./fixtures.mjs";

const PAGE_URL = "https://splice.com/sounds/search/samples";
const GRAPHQL = "https://surfaces-graphql.splice.com/graphql";

const CORS = {
  "access-control-allow-origin": "https://splice.com",
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS"
};

// The page's own script: what Splice's bundle does, reduced to the two requests
// the tap cares about.
const PAGE_HTML = `<!doctype html><html><head><title>Splice</title></head>
  <body style="background:#111;color:#eee;font-family:sans-serif">
    <h1>Sounds</h1>
    <script>
      window.spliceSearch = async () => {
        const response = await fetch("${GRAPHQL}", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ operationName: "SamplesSearch", variables: { filepath: "tap" } })
        });

        // The page reads the body itself, after the tap has cloned it.
        const body = await response.json();
        return body.data.assetsSearch.items.map(x => x.name);
      };

      window.splicePlay = async index => {
        const response = await fetch("${CDN}/preview-" + index + ".mp3");
        return (await response.arrayBuffer()).byteLength;
      };
    </script>
  </body></html>`;

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
};

const preview = scramble(makeAudio());
const profile = await mkdtemp(path.join(tmpdir(), "splicedd-tap-"));

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

let graphqlCalls = 0;

await context.route("**/*", async route => {
  const request = route.request();
  const url = request.url();

  if (request.method() == "OPTIONS") {
    return route.fulfill({ status: 204, headers: CORS });
  }

  if (url.startsWith(GRAPHQL)) {
    graphqlCalls++;
    return route.fulfill({
      status: 200,
      headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify(searchResponse(request.postData() ?? "{}"))
    });
  }

  if (url.startsWith(CDN)) {
    return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "audio/mpeg" }, body: preview });
  }

  if (url.startsWith("https://splice.com/")) {
    return route.fulfill({ status: 200, contentType: "text/html", body: PAGE_HTML });
  }

  return route.continue();
});

const page = await context.newPage();
page.on("pageerror", err => console.log("   [page exception]", err.message));

await page.goto(PAGE_URL);
await page.waitForFunction(() => document.documentElement.dataset.splicedd == "on", null, { timeout: 15_000 });

// --- the tap is in the page, once ---

check("the tap installs itself in the page's world", await page.evaluate(() => window.__spliceddTap === true));

// --- the page's own search still works ---

const names = await page.evaluate(() => window.spliceSearch());
check(
  "the page reads its own response, untouched",
  Array.isArray(names) && names[0] == "tap_one.wav",
  JSON.stringify(names)
);

const searchesBefore = graphqlCalls;

// --- playing on Splice surfaces the sample ---

await page.evaluate(() => window.splicePlay(2));

// The card is gone; what the tap is for is knowing what the page is doing.

const [worker] = context.serviceWorkers();
const heard = () => worker.evaluate(async () => (await chrome.storage.local.get("played")).played);

await page
  .waitForFunction(async () => true, null, { timeout: 100 }).catch(() => {});

await page.waitForTimeout(1500);
const noted = await heard();

check(
  "a preview Splice plays is named from what the tap saw",
  noted?.length == 1 && noted[0].name == "tap_two.wav",
  JSON.stringify(noted?.map(x => x.name))
);

check(
  "and naming it cost no search of Splicedd's own",
  graphqlCalls == searchesBefore,
  `${graphqlCalls - searchesBefore} extra searches`
);

await page.evaluate(() => window.splicePlay(1));
await page.waitForTimeout(1500);

const both = await heard();

check(
  "the next one is noted too, newest first",
  both?.length == 2 && both[0].name == "tap_one.wav",
  JSON.stringify(both?.map(x => x.name))
);

await context.close();
await rm(profile, { recursive: true, force: true });

const failed = checks.filter(x => !x.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length == 0 ? 0 : 1);
