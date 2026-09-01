import { ChevronLeft, ChevronRight } from "lucide-react";

/** Page numbers around the current one, with the first and last always present. */
function pageList(current: number, total: number): (number | "gap")[] {
  const pages: (number | "gap")[] = [];

  for (let page = 1; page <= total; page++) {
    if (page == 1 || page == total || Math.abs(page - current) <= 1) {
      pages.push(page);
    } else if (pages[pages.length - 1] != "gap") {
      pages.push("gap");
    }
  }

  return pages;
}

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

      {pageList(page, totalPages).map((entry, index) => entry == "gap"
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
