import type { ThemePref } from "../state/useTheme";
import { useT } from "../i18n/I18nProvider";

// Order the button cycles through.
const ORDER: ThemePref[] = ["light", "dark", "auto"];

const ICON: Record<ThemePref, string> = { light: "☀", dark: "☾", auto: "◐" };

/** One button, cycling light → dark → device. */
export default function ThemeToggle({
  pref,
  onChange,
}: {
  pref: ThemePref;
  onChange: (next: ThemePref) => void;
}) {
  const t = useT();
  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
  const label = t(`theme.${pref}`);

  return (
    <button
      type="button"
      className="theme-toggle"
      title={t(`theme.${pref}Title`)}
      aria-label={t("theme.aria", { current: label, next: t(`theme.${next}`) })}
      onClick={() => onChange(next)}
    >
      <span className="theme-toggle-icon" aria-hidden="true">{ICON[pref]}</span>
      <span className="theme-toggle-label">{label}</span>
    </button>
  );
}
