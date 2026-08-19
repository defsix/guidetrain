import { injuryFor } from "../lib/injuries";
import { injuryTag } from "../lib/injuryMessage";
import type { Injury } from "../state/useInjuries";
import { useI18n } from "../i18n/I18nProvider";

type Candidate = { id: string; name: string; equipment?: string; primary: string[] };

type Props = {
  /** The exercise being replaced, or null when the panel is closed. */
  exercise: Candidate | null;
  candidates: Candidate[];
  /** Injuries marked on the Stats page — a candidate under "avoid" is already
      filtered out before this panel ever sees it; "warn" ones are flagged here. */
  injuries: Record<string, Injury>;
  onPick: (id: string) => void;
  onClose: () => void;
};

/**
 * Replace one exercise with another that trains the same muscle.
 *
 * Opened from a busy rack, not from a plan you no longer want — so the list
 * is narrow on purpose (`swapsFor` in `pairs.js`) and every candidate really
 * does train what the one it replaces trains. Picking one keeps the workout's
 * position and its sets-and-reps target; it does not touch anything already
 * logged, which stays exactly what it always was.
 */
export default function SwapPanel({ exercise, candidates, injuries, onPick, onClose }: Props) {
  const { t } = useI18n();
  if (!exercise) return null;

  return (
    <>
      <button className="workout-scrim" aria-label={t("swap.close")} onClick={onClose} />
      <aside className="swap-panel" aria-label={t("swap.title", { name: exercise.name })}>
        <div className="workout-head">
          <h2>{t("swap.title", { name: exercise.name })}</h2>
          <button className="workout-close" onClick={onClose} aria-label={t("swap.close")}>
            ✕
          </button>
        </div>

        <p className="plans-intro">{t("swap.intro")}</p>

        {candidates.length === 0 ? (
          <p className="workout-empty">{t("swap.empty")}</p>
        ) : (
          <ul className="swap-list">
            {candidates.map((c) => {
              const injury = injuryFor(c, injuries);
              return (
                <li key={c.id}>
                  <button className="swap-option" onClick={() => onPick(c.id)}>
                    <span className="swap-name">{c.name}</span>
                    <span className="tags">
                      {c.equipment && (
                        <em>{t(`equipment.${c.equipment}`, undefined, c.equipment)}</em>
                      )}
                      {injury && <em className="injury-flag">{injuryTag(t, injury.mode)}</em>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </>
  );
}
