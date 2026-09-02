import { Search } from "lucide-react";

import { SearchEntry } from "../../chrome/lists";
import { Button, IconButton } from "./primitives";
import { Trash2 } from "lucide-react";

/**
 * The listings that have been looked at. Going back to one is a real
 * navigation: a search's first page is Splice's to render, and its own page is
 * where every row's buttons are.
 */
export default function SearchList(
  { entries, onForget, onClear }: {
    entries: SearchEntry[] | null;
    onForget: (uuid: string) => void;
    onClear: () => void;
  }
) {
  if (entries == null) {
    return <div className="sd-settings"><p className="sd-hint">Reading...</p></div>;
  }

  if (entries.length == 0) {
    return (
      <div className="sd-settings">
        <p className="sd-hint">
          Nothing searched yet. Every listing you look at on splice.com is noted here, so a search you
          liked the results of is one click away.
        </p>
      </div>
    );
  }

  return (
    <div className="sd-settings">
      <div className="sd-row-between">
        <span className="sd-label">{entries.length}</span>
        <Button variant="link" onClick={onClear}>Clear</Button>
      </div>

      <div className="sd-history">
        {entries.map(entry => (
          <div key={entry.uuid} className="sd-history-row">
            <span className="sd-history-cover"><Search size={14} aria-hidden /></span>

            <button
              type="button"
              className="sd-history-text sd-search-again"
              title={entry.url}
              onClick={() => window.location.assign(entry.url)}
            >
              <strong>{entry.query}</strong>
              <small>{entry.records.toLocaleString()} results</small>
            </button>

            <IconButton label="Forget this one" onClick={() => onForget(entry.uuid)}>
              <Trash2 size={15} />
            </IconButton>
          </div>
        ))}
      </div>
    </div>
  );
}
