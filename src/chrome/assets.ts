/** Resolves a file packaged with the extension to a URL the page can load. */
export function assetUrl(name: string) {
  return chrome.runtime.getURL(`icons/${name}`);
}
