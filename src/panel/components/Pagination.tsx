import { ChevronLeft, ChevronRight } from "lucide-react";

import { GAP, pageList } from "../../paging";

export default function Pagination(
  { page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }
) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav className="sd-pagination" aria-label="Search results pages">
      <button
        type="button" className="sd-page" aria-label="Previous page"
        disabled={page <= 1} onClick={() => onChange(page - 1)}
      ><ChevronLeft size={16} /></button>

      {pageList(page, totalPages).map((entry, index) => entry == GAP
        ? <button key={`gap-${index}`} type="button" className="sd-page" data-ellipsis="true" disabled>...</button>
        : <button
            key={entry}
            type="button"
            className="sd-page"
            data-current={entry == page}
            aria-current={entry == page ? "page" : undefined}
            onClick={() => onChange(entry)}
          >{entry}</button>
      )}

      <button
        type="button" className="sd-page" aria-label="Next page"
        disabled={page >= totalPages} onClick={() => onChange(page + 1)}
      ><ChevronRight size={16} /></button>
    </nav>
  );
}
