// The panel's building blocks. Every one of them is a thin, styled wrapper
// around a native control, so keyboard support and accessibility come for free.

import { ReactNode } from "react";
import { ChevronDown, LucideIcon } from "lucide-react";

export function IconButton(
  { label, onClick, children, active, disabled, className }: {
    label: string;
    onClick?: () => void;
    children: ReactNode;
    active?: boolean;
    disabled?: boolean;
    className?: string;
  }
) {
  return (
    <button
      type="button"
      className={`sd-icon-button ${className ?? ""}`}
      aria-label={label}
      title={label}
      data-active={active === true}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Button(
  { children, onClick, variant = "primary", disabled }: {
    children: ReactNode;
    onClick?: () => void;
    variant?: "primary" | "ghost" | "link";
    disabled?: boolean;
  }
) {
  return (
    <button type="button" className="sd-button" data-variant={variant} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export function Select<T extends string>(
  { icon: Icon, label, value, options, onChange }: {
    icon: LucideIcon;
    label: string;
    value: T;
    options: SelectOption<T>[];
    onChange: (value: T) => void;
  }
) {
  return (
    <div className="sd-select">
      <Icon size={15} aria-hidden />
      <select aria-label={label} title={label} value={value} onChange={ev => onChange(ev.target.value as T)}>
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <ChevronDown size={14} aria-hidden />
    </div>
  );
}

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      className="sd-switch"
      data-checked={checked}
      onClick={() => onChange(!checked)}
    />
  );
}
