// Builds the Splicedd extension into `dist/`, ready to be loaded unpacked.
//
//   yarn build          production build
//   yarn dev            rebuild on change
//
// The entry points can't share one Vite build: content scripts and offscreen
// documents run as classic scripts, the service worker is an ES module, and
// Rollup's IIFE output takes a single input per build.

import { build } from "vite";
import react from "@vitejs/plugin-react";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, "dist");
const watch = process.argv.includes("--watch");

/** @type {{ entry: string, file: string, format: "iife" | "es" }[]} */
const TARGETS = [
  { entry: "src/content.tsx", file: "content.js", format: "iife" },
  { entry: "src/page/tap.ts", file: "tap.js", format: "iife" },
  { entry: "src/background.ts", file: "background.js", format: "es" },
  { entry: "src/offscreen.ts", file: "offscreen.js", format: "iife" }
];

const STATIC_FILES = ["offscreen.html", "icons"];

async function buildTarget({ entry, file, format }) {
  await build({
    root,
    configFile: false,
    plugins: [react()],
    // React and its dependencies branch on this; without a definition the
    // bundle would reference a `process` global no page context provides.
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    logLevel: "warn",
    build: {
      outDir,
      emptyOutDir: false,
      copyPublicDir: false,
      target: "chrome116",
      minify: true,
      sourcemap: false,
      watch: watch ? {} : null,
      lib: {
        entry: path.join(root, entry),
        formats: [format],
        fileName: () => file,
        // Only meaningful for the IIFE bundles, where Rollup insists on one.
        name: "splicedd"
      },
      rollupOptions: { output: { inlineDynamicImports: true } }
    }
  });

  console.log(`  built ${file}`);
}

async function copyStatic() {
  const { version } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));

  // package.json is the single source of truth for the version.
  manifest.version = version;
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  for (const file of STATIC_FILES) {
    await cp(path.join(root, file), path.join(outDir, file), { recursive: true });
  }

  console.log(`  copied manifest.json, ${STATIC_FILES.join(", ")}`);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

console.log("building the Splicedd extension into dist/");

for (const target of TARGETS) {
  await buildTarget(target);
}

await copyStatic();

console.log(watch
  ? "\nwatching for changes — press the reload button in chrome://extensions after each rebuild"
  : "\ndone. load dist/ through chrome://extensions -> Load unpacked");
