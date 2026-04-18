import { useEffect, useId, useRef, useState } from "react";
import "./Dropdown.css";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface DropdownProps<T extends string> {
  value: T;
  options: readonly DropdownOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
}

export default function Dropdown<T extends string>({ value, options, onChange, ariaLabel }: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const select = (v: T) => {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const openAndFocus = (which: "first" | "selected") => {
    setOpen(true);
    requestAnimationFrame(() => {
      const items = listRef.current?.querySelectorAll<HTMLLIElement>('[role="option"]');
      if (!items) return;
      const idx = which === "selected" ? Math.max(0, options.findIndex((o) => o.value === value)) : 0;
      items[idx]?.focus();
    });
  };

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openAndFocus("selected");
    }
  };

  const onOptionKey = (e: React.KeyboardEvent<HTMLLIElement>, i: number) => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLLIElement>('[role="option"]') ?? []);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[Math.min(i + 1, items.length - 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[Math.max(i - 1, 0)]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      select(options[i].value);
    }
  };

  return (
    <div ref={wrapRef} className="dropdown">
      <button
        ref={triggerRef}
        type="button"
        className="dropdown-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? setOpen(false) : openAndFocus("selected"))}
        onKeyDown={onTriggerKey}
      >
        <span className="dropdown-trigger-label">{current.label}</span>
        <span className="dropdown-chevron" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul ref={listRef} id={listId} role="listbox" className="dropdown-menu">
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              tabIndex={-1}
              className={`dropdown-option${o.value === value ? " dropdown-option--selected" : ""}`}
              onClick={() => select(o.value)}
              onKeyDown={(e) => onOptionKey(e, i)}
            >
              <strong className="dropdown-option-label">{o.label}</strong>
              {o.description && <small className="dropdown-option-hint">{o.description}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
