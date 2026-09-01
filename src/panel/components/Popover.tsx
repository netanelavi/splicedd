import { ReactNode, useEffect, useRef, useState } from "react";
import { ChevronDown, LucideIcon } from "lucide-react";

/**
 * A filter field that opens a sheet underneath the filter bar.
 *
 * The sheet is positioned against `.sd-filters` rather than the trigger, so it
 * always spans the panel instead of hanging off its edge -- there isn't room
 * beside a 110px-wide field for anything useful.
 */
export default function Popover(
  { icon: Icon, label, active, children }: {
    icon: LucideIcon;
    label: string;

    /** Whether the filter behind this field is currently narrowing the search. */
    active?: boolean;

    children: (close: () => void) => ReactNode;
  }
) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open)
      return;

    // The panel lives in a shadow root, so `event.target` outside of it is the
    // host element -- composedPath() is what actually says where a click landed.
    const onPointerDown = (ev: Event) => {
      if (!ev.composedPath().includes(wrapper.current!)) {
        setOpen(false);
      }
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key == "Escape") {
        ev.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return (
    // `display: contents` keeps the trigger a direct child of the filter grid,
    // and stops this wrapper from becoming the sheet's containing block.
    <div ref={wrapper} style={{ display: "contents" }}>
      <button
        type="button"
        className="sd-field"
        title={label}
        aria-expanded={open}
        data-open={open}
        data-active={active === true}
        onClick={() => setOpen(x => !x)}
      >
        <Icon size={15} aria-hidden />
        <span>{label}</span>
        <ChevronDown size={14} aria-hidden />
      </button>

      {open && <div className="sd-popover">{children(() => setOpen(false))}</div>}
    </div>
  );
}
