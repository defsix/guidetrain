import { useMemo, useState } from "react";
import { ALL_EXERCISES } from "../lib/exerciseCatalogue";
import { injuryFor, isAvoided } from "../lib/injuries";
import { injuryTag, injuryNote } from "../lib/injuryMessage";
import type { Injury } from "../state/useInjuries";
import { useI18n } from "../i18n/I18nProvider";
import { useSwipeDismiss } from "../state/useSwipeDismiss";

type Props = {
  open: boolean;
  onClose: () => void;
  /** The active program's exercise ids — which rows already show as added. */
  programIds: string[];
  /** `programs.toggle` — adds if absent, removes if present. Same primitive
      the muscle picker's own "save" button already calls. */
  onToggle: (id: string) => void;
  injuries: Record<string, Injury>;
};

/**
 * Every bodyweight exercise in the catalogue, browsable on its own rather
 * than only reachable one muscle at a time from the 3D picker.
 *
 * Scoped to `equipment === "body only"` specifically, not a broader
 * "calisthenics-ish" guess — that's the exact tag `SetLogger` already reads
 * to log reps alone, and the exact tag `BODYONLY` in `plans.ts` already
 * derives itself from, so every row here logs and prescribes correctly with
 * nothing new added to either. Adding a genuinely bodyweight-only move later
 * is as simple as tagging it `"body only"` in `exercises.json` — it shows up
 * here and everywhere else on its own.
 */
export default function CalisthenicsLibrary({
  open, onClose, programIds, onToggle, injuries,
}: Props) {
  const { t, localizeExercise } = useI18n();
  const [muscle, setMuscle] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const swipe = useSwipeDismiss(onClose);

  const inProgram = useMemo(() => new Set(programIds), [programIds]);

  const bodyweight = useMemo(
    () => ALL_EXERCISES.filter((x) => x.equipment === "body only"),
    [],
  );

  const muscles = useMemo(() => {
    const seen = new Set<string>();
    for (const x of bodyweight) for (const m of x.primary) seen.add(m);
    return [...seen].sort();
  }, [bodyweight]);

  const items = useMemo(() => {
    const filtered = bodyweight
      .filter((x) => !isAvoided(x, injuries))
      .filter((x) => !muscle || x.primary.includes(muscle))
      .map(localizeExercise);
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [bodyweight, injuries, muscle, localizeExercise]);

  if (!open) return null;

  return (
    <>
      <button className="workout-scrim" aria-label={t("calisthenics.close")} onClick={onClose} />
      <aside className="calisthenics-panel" aria-label={t("calisthenics.title")}>
        <div className={`workout-head ${swipe.dragging ? "dragging" : ""}`} {...swipe.handleProps}>
          <span className="sheet-handle" aria-hidden="true" />
          <h2>{t("calisthenics.title")}</h2>
          <button className="workout-close" onClick={onClose} aria-label={t("calisthenics.close")}>
            ✕
          </button>
        </div>

        <p className="plans-intro">{t("calisthenics.intro")}</p>

        {muscles.length > 0 && (
          <div className="chip-row">
            <button
              type="button"
              className={`chip ${muscle === null ? "chip-selected" : ""}`}
              onClick={() => setMuscle(null)}
            >
              {t("calisthenics.allMuscles")}
            </button>
            {muscles.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip ${muscle === m ? "chip-selected" : ""}`}
                onClick={() => setMuscle(muscle === m ? null : m)}
              >
                {t(`muscles.${m}.name`, undefined, m)}
              </button>
            ))}
          </div>
        )}

        {items.length === 0 ? (
          <p className="workout-empty">{t("calisthenics.empty")}</p>
        ) : (
          <ul className="calisthenics-list">
            {items.map((x) => {
              const injury = injuryFor(x, injuries);
              const added = inProgram.has(x.id);
              const isOpen = expanded === x.id;
              return (
                <li key={x.id}>
                  <div className="calisthenics-row">
                    <button
                      type="button"
                      className="calisthenics-name"
                      onClick={() => setExpanded(isOpen ? null : x.id)}
                      aria-expanded={isOpen}
                    >
                      {isOpen ? "▾" : "▸"} {x.name}
                      {injury && (
                        <em className={`injury-flag injury-flag-${injury.mode}`} title={injuryNote(t, injury.mode, t(`muscles.${injury.muscle}.name`, undefined, injury.muscle))}>
                          {injuryTag(t, injury.mode)}
                        </em>
                      )}
                    </button>
                    <button
                      type="button"
                      className={`save ${added ? "on" : ""}`}
                      onClick={() => onToggle(x.id)}
                      aria-pressed={added}
                      aria-label={`${added ? t("workout.remove") : t("workout.add")} — ${x.name}`}
                      title={added ? t("workout.remove") : t("workout.add")}
                    >
                      {added ? "✓" : "+"}
                    </button>
                  </div>
                  {isOpen && x.instructions.length > 0 && (
                    <ol className="how-steps calisthenics-steps">
                      {x.instructions.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </>
  );
}
