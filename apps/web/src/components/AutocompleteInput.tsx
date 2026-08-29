import { useEffect, useMemo, useRef, useState } from "react";
import { scrollIntoViewOnFocus } from "../lib/scrollIntoViewOnFocus";

type Props = {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  id?: string;
  className?: string;
  /** How many matches to show at once — the list scrolls past this, but a
      hundred-row dropdown is a wall, not a shortlist. */
  maxResults?: number;
};

/**
 * A text field with a filtered dropdown of matching options — substring
 * match against `options`, case-insensitive, capped at `maxResults`.
 *
 * Deliberately a plain string in and a plain string out, the same shape a
 * bare `<input>` already had: the caller still owns resolving the typed or
 * picked text to whatever it actually means (an exercise id, here), so
 * swapping this in for an `<input list>` didn't need to touch that logic.
 *
 * Not a combobox library — 180 options is a `.filter()`, not a reason for a
 * dependency, in keeping with the rest of this app's dependency budget.
 */
export default function AutocompleteInput({
  options, value, onChange, placeholder, "aria-label": ariaLabel, id, className, maxResults = 8,
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useRef(`ac-${Math.random().toString(36).slice(2, 8)}`).current;

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return options.filter((o) => o.toLowerCase().includes(q)).slice(0, maxResults);
  }, [options, value, maxResults]);

  // A click landing anywhere outside closes the dropdown — the input itself
  // only opens it back up on focus or the next keystroke.
  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open]);

  function select(name: string) {
    onChange(name);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(matches[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={`autocomplete ${className ?? ""}`} ref={rootRef}>
      <input
        id={id}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        className="autocomplete-input"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={(e) => {
          setOpen(true);
          scrollIntoViewOnFocus(
            e,
            () => rootRef.current?.querySelector<HTMLElement>(".autocomplete-list") ?? null,
          );
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <ul className="autocomplete-list" role="listbox" id={listboxId}>
          {matches.map((name, i) => (
            <li
              key={name}
              role="option"
              aria-selected={i === highlight}
              className={`autocomplete-option ${i === highlight ? "highlight" : ""}`}
              // mousedown, not click: click would fire after the input's own
              // blur has already closed the list, so the tap would land on
              // nothing.
              onMouseDown={(e) => {
                e.preventDefault();
                select(name);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
