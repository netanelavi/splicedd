import { EllipsisVertical } from "lucide-react";

import { SpliceTag } from "../../splice/entities";

/**
 * The tags present in the current results, most common first, with the selected
 * ones pinned to the front so they never scroll out of view.
 */
export default function TagCloud(
  { tags, selected, expanded, onToggleTag, onToggleExpanded }: {
    tags: SpliceTag[];
    selected: readonly string[];
    expanded: boolean;
    onToggleTag: (tag: SpliceTag) => void;
    onToggleExpanded: () => void;
  }
) {
  if (tags.length == 0) {
    return null;
  }

  const ordered = [
    ...tags.filter(x => selected.includes(x.uuid)),
    ...tags.filter(x => !selected.includes(x.uuid))
  ];

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
      <div className="sd-tags" data-expanded={expanded}>
        {ordered.map(tag => (
          <button
            key={tag.uuid}
            type="button"
            className="sd-tag"
            aria-pressed={selected.includes(tag.uuid)}
            data-selected={selected.includes(tag.uuid)}
            onClick={() => onToggleTag(tag)}
          >{tag.label}</button>
        ))}
      </div>

      <button
        type="button"
        className="sd-tag"
        aria-label={expanded ? "Show fewer tags" : "Show all tags"}
        title={expanded ? "Show fewer tags" : "Show all tags"}
        onClick={onToggleExpanded}
      ><EllipsisVertical size={12} /></button>
    </div>
  );
}
