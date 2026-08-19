import { MUSCLES } from "../lib/muscleRegions";
import type { Injury, InjuryMode } from "../state/useInjuries";
import { useI18n } from "../i18n/I18nProvider";

type Props = {
  open: boolean;
  onClose: () => void;
  injuries: Record<string, Injury>;
  onSet: (muscleId: string, mode: InjuryMode) => void;
  onClear: (muscleId: string) => void;
};

/**
 * A muscle you're working around, marked one of two ways.
 *
 * "Avoid" keeps anything whose primary muscle is this one out of Train This,
 * the rest-break partner list and the swap list — it never suggests what it
 * would tell you to avoid. "Warn" leaves every one of those lists exactly as
 * it always was, only flagged, for an injury real enough to note but not bad
 * enough to plan around. The choice is made per muscle, when it's marked —
 * there's no single global setting, because a knee that rules out squats
 * entirely is a different injury from a shoulder that just needs watching.
 *
 * Primary muscle only: an exercise that merely uses this muscle to assist —
 * the way a bench press leans on the triceps — isn't touched, since the
 * injury is about what the lift is actually training, not everything it
 * happens to brush. `lib/injuries.ts`'s `injuryFor()` is what applies that
 * rule everywhere this list is read back.
 */
export default function InjuryPanel({ open, onClose, injuries, onSet, onClear }: Props) {
  const { t } = useI18n();
  if (!open) return null;

  function toggle(muscleId: string, mode: InjuryMode) {
    if (injuries[muscleId]?.mode === mode) onClear(muscleId);
    else onSet(muscleId, mode);
  }

  return (
    <>
      <button className="workout-scrim" aria-label={t("injuryPanel.close")} onClick={onClose} />
      <aside className="injury-panel" aria-label={t("injuryPanel.title")}>
        <div className="workout-head">
          <h2>{t("injuryPanel.title")}</h2>
          <button className="workout-close" onClick={onClose} aria-label={t("injuryPanel.close")}>
            ✕
          </button>
        </div>

        <p className="plans-intro">{t("injuryPanel.intro")}</p>

        <ul className="injury-list">
          {MUSCLES.map((m) => {
            const current = injuries[m.key];
            const name = t(`muscles.${m.key}.name`, undefined, m.name);
            return (
              <li className="injury-row" key={m.key}>
                <span className="injury-name">{name}</span>
                <div className="chip-row">
                  <button
                    type="button"
                    className={`chip ${current?.mode === "avoid" ? "chip-selected" : ""}`}
                    aria-pressed={current?.mode === "avoid"}
                    onClick={() => toggle(m.key, "avoid")}
                  >
                    {t("injuryPanel.avoid")}
                  </button>
                  <button
                    type="button"
                    className={`chip ${current?.mode === "warn" ? "chip-selected" : ""}`}
                    aria-pressed={current?.mode === "warn"}
                    onClick={() => toggle(m.key, "warn")}
                  >
                    {t("injuryPanel.warn")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="plan-note">{t("injuryPanel.note")}</p>
      </aside>
    </>
  );
}
