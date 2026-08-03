import type { ThemePref } from "../state/useTheme";

// Order the button cycles through.
const ORDER: ThemePref[] = ["light", "dark", "auto"];

const FACE: Record<ThemePref, { icon: string; label: string; title: string }> = {
  light: { icon: "☀", label: "Light", title: "Light — tap for dark" },
  dark: { icon: "☾", label: "Dark", title: "Dark — tap to follow device" },
  auto: { icon: "◐", label: "Device", title: "Following device — tap for light" },
};

/** One button, cycling light → dark → device. */
export default function ThemeToggle({
  pref,
  onChange,
}: {
  pref: ThemePref;
  onChange: (next: ThemePref) => void;
}) {
  const face = FACE[pref];
  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];

  return (
    <button
      type="button"
      className="theme-toggle"
      title={face.title}
      aria-label={`Colour theme: ${face.label}. Tap to switch to ${FACE[next].label}.`}
      onClick={() => onChange(next)}
    >
      <span className="theme-toggle-icon" aria-hidden="true">{face.icon}</span>
      <span className="theme-toggle-label">{face.label}</span>
    </button>
  );
}
