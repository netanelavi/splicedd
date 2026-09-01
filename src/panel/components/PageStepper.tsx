import { ChevronLeft, ChevronRight } from "lucide-react";

import { PageDirection, PageState } from "../../page/pager";
import { IconButton } from "./primitives";

/**
 * Walks splice.com's own result pages from where the samples are, rather than
 * from the bottom of the list where Splice puts its paginator.
 */
export default function PageStepper(
  { state, onTurn }: { state: PageState; onTurn: (direction: PageDirection) => void }
) {
  return (
    <div className="sd-stepper">
      <IconButton label="Previous page" disabled={!state.hasPrev} onClick={() => onTurn("prev")}>
        <ChevronLeft size={16} />
      </IconButton>

      <span>{state.summary ?? `Page ${state.page}`}</span>

      <IconButton label="Next page" disabled={!state.hasNext} onClick={() => onTurn("next")}>
        <ChevronRight size={16} />
      </IconButton>
    </div>
  );
}
