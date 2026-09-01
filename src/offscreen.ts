// The offscreen document exists for one reason: a service worker has no
// URL.createObjectURL, and chrome.downloads can't read a blob URL minted inside
// a web page. This document mints them in the extension's own origin.
//
// Only chrome.runtime is available here, so the download itself stays in the
// service worker.

import { base64ToBytes } from "./chrome/base64";
import { OffscreenReply, OffscreenRequest, respondAsync } from "./chrome/messages";

chrome.runtime.onMessage.addListener((message: OffscreenRequest, _sender, sendResponse) => {
  if (!("target" in message) || message.target != "offscreen") {
    return false;
  }

  return respondAsync(sendResponse, async () => handle(message));
});

function handle(request: OffscreenRequest): OffscreenReply[OffscreenRequest["kind"]] {
  switch (request.kind) {
    case "create-blob-url":
      return {
        url: URL.createObjectURL(new Blob([base64ToBytes(request.base64)], { type: request.mime }))
      };

    case "revoke-blob-url":
      URL.revokeObjectURL(request.url);
      return {};
  }
}
