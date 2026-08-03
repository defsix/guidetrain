import type { ThemePref } from "../state/useTheme";

const OPTIONS: { value: ThemePref; label: string; title: string }[] = [
  { value: "light", label: "Light", title: "Always light" },
  { value: "dark", label: "Dark", title: "Always dark" },
  { value: "auto", label: "Device", title: "Follow device setting" },
];

/** Three-way theme switch: light, dark, or follow the device. */
export default function ThemeToggle({
  pref,
  onChange,
}: {
  pref: ThemePref;
  onChange: (next: ThemePref) => void;
}) {
  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Colour theme">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          title={o.title}
          className={pref === o.value ? "active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
