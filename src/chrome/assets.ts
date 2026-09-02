/** Resolves a file packaged with the extension to a URL the page can load. */
export function assetUrl(name: string) {
  try {
    return chrome.runtime.getURL(`icons/${name}`);
  } catch {
    // The extension was reloaded underneath this page; nothing of its own is
    // reachable any more, and an empty image is better than a page that fails.
    return "";
  }
}
