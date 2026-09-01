// The content script: mounts the Splicedd panel into every splice.com page.
//
// Everything renders inside a shadow root, so Splice's stylesheet can't reach
// the panel and the panel's can't reach the page.

import { createRoot } from "react-dom/client";

import { loadSettings } from "./chrome/settings";
import App from "./panel/App";
import panelStyles from "./panel/panel.css?raw";

const HOST_ID = "splicedd-panel-host";

async function mount() {
  // The service worker injects this script into tabs that predate the
  // extension, which can race with the manifest's own injection.
  if (document.getElementById(HOST_ID) != null) {
    return;
  }

  await loadSettings();

  const host = document.createElement("div");
  host.id = HOST_ID;

  // Inline, so a page rule matching the host element can't move or hide it.
  host.style.cssText = "all: initial";

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = panelStyles;
  shadow.append(style);

  const container = document.createElement("div");
  shadow.append(container);

  // Attached to the document element rather than the body: a transformed
  // ancestor would otherwise anchor the panel's fixed positioning to itself.
  document.documentElement.append(host);

  createRoot(container).render(<App host={host} />);
}

void mount();
