// End-to-end check for reaching the settings from the extension itself.
//
// The toolbar icon's own context menu can't be clicked from Playwright, so the
// command it sends is sent the same way the worker sends it -- which is the
// part that has to work.

import { chromium } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { EXTENSION } from "./fixtures.mjs";

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
};

const profile = await mkdtemp(path.join(tmpdir(), "splicedd-settings-"));
const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  executablePath: "/opt/pw-browsers/chromium",
  args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`]
});

await context.route("**/*", route => route.request().url().startsWith("https://splice.com/")
  ? route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body><h1>Sounds</h1></body></html>" })
  : route.fulfill({ status: 200, body: "" }));

const page = await context.newPage();
await page.goto("https://splice.com/sounds/search/samples");
await page.waitForFunction(() => document.documentElement.dataset.splicedd == "on", null, { timeout: 15_000 });

const [worker] = context.serviceWorkers();

// --- the menu the extension registers ---

const menus = await worker.evaluate(() => new Promise(resolve => {
  // Re-running the installer is how its menu items are inspected; creating one
  // that already exists reports the clash rather than adding a duplicate.
  chrome.contextMenus.create({ id: "splicedd-settings", title: "probe", contexts: ["action"] }, () => {
    resolve(chrome.runtime.lastError?.message ?? "created a second one");
  });
}));

check(
  "the toolbar icon carries a settings entry",
  menus.includes("duplicate id") || menus.includes("already exists"),
  menus
);

// --- and asking for the settings opens the panel on them ---

await worker.evaluate(async () => {
  const [tab] = await chrome.tabs.query({ url: "https://splice.com/*" });
  await chrome.tabs.sendMessage(tab.id, { kind: "settings" });
});

await page.locator(".sd-settings").waitFor({ timeout: 5000 }).then(
  () => check("asking for the settings opens the panel on them", true),
  err => check("asking for the settings opens the panel on them", false, err.message.split("\n")[0]));

check("the folder control is there to use", await page.locator(".sd-folder").count() == 1);

await context.close();
await rm(profile, { recursive: true, force: true });

const failed = checks.filter(x => !x.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length == 0 ? 0 : 1);
