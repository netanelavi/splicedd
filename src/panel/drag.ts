import { DragEvent } from "react";

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

  // Only the name goes alongside it. Offering the blob URL as `text/uri-list`
  // would look helpful and be the opposite: a drop target that reads that
  // first fetches the blob and names the file after it, which is an id.
  transfer.setData("text/plain", file.name);
}


/**
 * Whether a drag began on a control rather than on the draggable row around it.
 * Buttons and waveforms mark themselves `data-no-drag`, and pressing one should
 * press it, not pick the row up.
 */
export function startedOnControl(event: DragEvent) {
  return event.nativeEvent
    .composedPath()
    .some(node => node instanceof HTMLElement && node.dataset.noDrag == "true");
}
