import { DragEvent } from "react";

import { assetUrl } from "../chrome/assets";
/** What a drag needs to know about a file: not where it came from. */
export interface DraggableFile {
  /** An object URL for the bytes, which is what the OS is handed. */
  url: string;
  mime: string;
  name: string;
}

/**
 * What sits under the cursor while a sample is dragged. Chromium's default is a
 * ghost of whatever was grabbed, which for a small button is a small button --
 * and on Splice's own rows says nothing about where the file is coming from.
 *
 * Loaded once, up front: `setDragImage` takes the image as it is at the instant
 * the drag begins, and ignores one that hasn't decoded yet.
 */
const ICON_SIZE = 32;

const icon = new Image(ICON_SIZE, ICON_SIZE);
icon.src = assetUrl("icon-32.png");

/**
 * Hands a file to the operating system for the duration of a drag.
 *
 * `DownloadURL` is Chromium's channel for dragging a file out of a web page and
 * into another application: the browser downloads the URL and drops the
 * resulting file wherever it lands, which is how a sample reaches a DAW's
 * arrangement view. Its value is `mime:filename:url`.
 */
export function attachFileDrag(transfer: DataTransfer, file: DraggableFile) {
  transfer.effectAllowed = "copy";

  if (icon.complete && icon.naturalWidth > 0) {
    transfer.setDragImage(icon, ICON_SIZE / 2, ICON_SIZE / 2);
  }

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
