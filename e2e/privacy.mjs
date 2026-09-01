// End-to-end check that splice.com's analytics never leave the browser, and
// that turning the setting off lets them again.
//
// The page fires each beacon the way the tracker that sends it would -- a
// fetch, an image pixel, and a sendBeacon on unload -- so the check covers the
// transports a wrapper around `fetch` would miss.

import { chromium } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { EXTENSION } from "./fixtures.mjs";

const PAGE_URL = "https://splice.com/sounds/search/samples";

const TRACKERS = {
  "google analytics": "https://www.google-analytics.com/g/collect?v=2&tid=G-X",
  "facebook pixel": "https://www.facebook.com/tr?id=1&ev=PageView",
  "segment": "https://api.segment.io/v1/t",
  "datadog rum": "https://browser-intake-datadoghq.com/api/v2/rum?x=1",
  "bing uet": "https://bat.bing.com/action/0?ti=1",
  "tiktok pixel": "https://analytics.tiktok.com/api/v2/pixel"
};

const CONTROL = "https://splice.com/api/its-own-request";

const PAGE_HTML = `<!doctype html><html><head><title>Splice</title></head><body>
  <h1>Sounds</h1>
  <script>
    window.__sent = {};
    window.fire = async (name, url, how) => {
      try {
        if (how == "image") {
          await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
          });
        } else if (how == "beacon") {
          if (!navigator.sendBeacon(url, "event")) throw new Error("refused");
        } else {
          await fetch(url, { mode: "no-cors" });
        }

        window.__sent[name] = "sent";
      } catch (err) {
        window.__sent[name] = "blocked";
      }
    };
  </script>
</body></html>`;

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
};

const profile = await mkdtemp(path.join(tmpdir(), "splicedd-privacy-"));

const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  executablePath: "/opt/pw-browsers/chromium",
  args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`]
});

// Every request that gets past the extension is answered here, so "reached the
// tracker" and "was blocked" are told apart by whether this ever ran.
const reached = new Set();

await context.route("**/*", async route => {
  const url = route.request().url();

  if (url.startsWith("https://splice.com/sounds/")) {
    return route.fulfill({ status: 200, contentType: "text/html", body: PAGE_HTML });
  }

  reached.add(url.split("?")[0]);
  return route.fulfill({ status: 200, contentType: "image/gif", body: "" });
});

const page = await context.newPage();
await page.goto(PAGE_URL);
await page.waitForFunction(() => document.documentElement.dataset.splicedd == "on", null, { timeout: 15_000 });

async function fireAll() {
  reached.clear();

  await page.evaluate(async ({ trackers, control }) => {
    window.__sent = {};

    const hows = ["fetch", "image", "beacon"];
    let index = 0;

    for (const [name, url] of Object.entries(trackers)) {
      await window.fire(name, url, hows[index++ % hows.length]);
    }

    await window.fire("splice itself", control, "fetch");
  }, { trackers: TRACKERS, control: CONTROL });

  return page.evaluate(() => window.__sent);
}

// --- blocked by default ---

const blocked = await fireAll();

for (const [name, url] of Object.entries(TRACKERS)) {
  check(`${name} never leaves the browser`, !reached.has(url.split("?")[0]), blocked[name]);
}

check("splice.com's own requests are untouched", reached.has(CONTROL), blocked["splice itself"]);

// --- and allowed again when the setting is turned off ---

const [worker] = context.serviceWorkers();

await worker.evaluate(async () => {
  const stored = await chrome.storage.sync.get("settings");
  await chrome.storage.sync.set({ settings: { ...stored.settings, blockAnalytics: false } });
});

// The worker applies the change through the rulesets API; give it a moment.
await page.waitForTimeout(1500);

const allowed = await fireAll();
const through = Object.keys(TRACKERS).filter(name => reached.has(TRACKERS[name].split("?")[0]));

check(
  "turning the setting off lets them through again",
  through.length == Object.keys(TRACKERS).length,
  `${through.length}/${Object.keys(TRACKERS).length}: ${JSON.stringify(allowed)}`
);

await context.close();
await rm(profile, { recursive: true, force: true });

const failed = checks.filter(x => !x.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length == 0 ? 0 : 1);
