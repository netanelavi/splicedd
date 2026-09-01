import { SampleFile } from "./sampleStore";

/**
 * Hands a file to the operating system for the duration of a drag.
 *
 * `DownloadURL` is Chromium's channel for dragging a file out of a web page and
 * into another application: the browser downloads the URL and drops the
 * resulting file wherever it lands, which is how a sample reaches a DAW's
 * arrangement view. Its value is `mime:filename:url`.
 */
export function attachFileDrag(transfer: DataTransfer, file: SampleFile) {
  transfer.effectAllowed = "copy";
  transfer.setData("DownloadURL", `${file.mime}:${file.name}:${file.url}`);

  // Drop targets that don't speak DownloadURL (a text field, another tab) still
  // get something meaningful.
  transfer.setData("text/uri-list", file.url);
  transfer.setData("text/plain", file.name);
}
