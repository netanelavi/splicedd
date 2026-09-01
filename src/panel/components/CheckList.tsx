import { Check } from "lucide-react";

import { SearchConstraint } from "../../splice/search";

/**
 * The multiple-choice list behind the instrument and genre filters. Options come
 * from the current results, so they only ever offer a filter that would return
 * something.
 */
export default function CheckList(
  { options, selected, onToggle, emptyText }: {
    options: SearchConstraint[];
    selected: readonly string[];
    onToggle: (uuid: string) => void;
    emptyText: string;
  }
) {
  if (options.length == 0) {
    return <p className="sd-hint">{emptyText}</p>;
  }

  return (
    <div className="sd-check-list">
      {options.map(option => {
        const checked = selected.includes(option.uuid);

        return (
          <button
            key={option.uuid}
            type="button"
            className="sd-check"
            role="checkbox"
            aria-checked={checked}
            data-checked={checked}
            onClick={() => onToggle(option.uuid)}
          >
            <span aria-hidden><Check size={12} strokeWidth={3} /></span>
            <span>{option.name}</span>
          </button>
        );
      })}
    </div>
  );
}
