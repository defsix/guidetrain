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
      {/* Icon only. The label it used to carry is still announced through
          aria-label and shown on hover via title, so nothing is lost to a
          screen reader or to a mouse — only the width. */}
      <span className="theme-toggle-icon" aria-hidden="true">{ICON[pref]}</span>
    </button>
  );
}
