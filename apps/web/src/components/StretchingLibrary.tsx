import { useMemo, useState } from "react";
import stretchesData from "../anatomy/stretches.json";
import { useHoldTimer } from "../state/useHoldTimer";
import { injuryFor, isAvoided } from "../lib/injuries";
import { injuryTag, injuryNote } from "../lib/injuryMessage";
import type { Injury } from "../state/useInjuries";
import { useI18n } from "../i18n/I18nProvider";

type Stretch = { id: string; name: string; primary: string[]; instructions: string[] };

const STRETCHES = stretchesData.stretches as Stretch[];
const DEFAULT_HOLD_SECONDS = 30;

type Props = {
  open: boolean;
  onClose: () => void;
  injuries: Record<string, Injury>;
};

/** Minutes and seconds, the same format the rest timer reads in. */
function formatHold(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * A browsable list of stretches, on its own — no sets, no reps, no weight,
 * nothing logged. Held apart from `exercises.json` on purpose (see
 * `tools/exercises/build-stretches.py`): a stretch has no working weight to
 * prescribe and mixing it into the trainable catalogue would feed it into
 * machinery built for exactly that. This panel's whole job is instructions
 * plus a hold-timer, nothing else.
 */
export default function StretchingLibrary({ open, onClose, injuries }: Props) {
  const { t, localizeExercise } = useI18n();
  const [muscle, setMuscle] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const hold = useHoldTimer();

  const muscles = useMemo(() => {
    const seen = new Set<string>();
    for (const x of STRETCHES) for (const m of x.primary) seen.add(m);
    return [...seen].sort();
  }, []);

  const items = useMemo(() => {
    const filtered = STRETCHES
      .filter((x) => !isAvoided(x, injuries))
      .filter((x) => !muscle || x.primary.includes(muscle))
      .map(localizeExercise);
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [injuries, muscle, localizeExercise]);

  function startHold(id: string) {
    setHoldingId(id);
    hold.start(DEFAULT_HOLD_SECONDS);
  }

  function stopHold() {
    hold.clear();
    setHoldingId(null);
  }

  if (!open) return null;

  return (
    <>
      <button className="workout-scrim" aria-label={t("stretching.close")} onClick={onClose} />
      <aside className="stretching-panel" aria-label={t("stretching.title")}>
        <div className="workout-head">
          <h2>{t("stretching.title")}</h2>
          <button className="workout-close" onClick={onClose} aria-label={t("stretching.close")}>
            ✕
          </button>
        </div>

        <p className="plans-intro">{t("stretching.intro")}</p>

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
          <p className="workout-empty">{t("stretching.empty")}</p>
        ) : (
          <ul className="stretch-list">
            {items.map((x) => {
              const injury = injuryFor(x, injuries);
              const isOpen = expanded === x.id;
              const isHolding = holdingId === x.id && hold.running;
              return (
                <li key={x.id}>
                  <div className="stretch-row">
                    <button
                      type="button"
                      className="stretch-name"
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
                    {isHolding ? (
                      <span className="stretch-hold running">
                        <span className="stretch-hold-time">{formatHold(hold.remaining)}</span>
                        <button type="button" className="stretch-hold-stop" onClick={stopHold}>
                          {t("stretching.stop")}
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="stretch-hold" onClick={() => startHold(x.id)}>
                        {t("stretching.start")}
                      </button>
                    )}
                  </div>
                  {isOpen && x.instructions.length > 0 && (
                    <ol className="how-steps stretch-steps">
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
