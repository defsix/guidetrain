import { useMemo, useState } from "react";
import exercises from "../anatomy/exercises.json";
import { PLANS, prescribe } from "../lib/plans";
import type { PlanTemplate } from "../lib/plans";
import { bestEstimate } from "../lib/progression";
import type { SetEntry } from "../state/useLog";
import type { KnownMaxEntry } from "../state/useKnownMax";
import type { AppliedDay } from "../state/usePrograms";
import type { Profile } from "../types";
import { useI18n } from "../i18n/I18nProvider";

type Entry = { id: string; name: string; equipment?: string; instructions: string[] };

const BY_ID = new Map<string, Entry>();
for (const list of Object.values(exercises.muscles as Record<string, Entry[]>)) {
  for (const x of list) if (!BY_ID.has(x.id)) BY_ID.set(x.id, x);
}

type Props = {
  open: boolean;
  onClose: () => void;
  allSets: SetEntry[];
  profile: Profile | null;
  /** A max set by hand on the stats page, per exercise id — see useKnownMax. */
  knownMaxes: Record<string, KnownMaxEntry>;
  /** Applies the plan as named workouts, carrying the weights just previewed. */
  onApply: (days: AppliedDay[]) => void;
};

/**
 * Ready-made plans, previewed with the weights you would actually use.
 *
 * The preview is the point. A plan that says "Barbell Squat, 3 × 5" is a plan
 * you still have to decide about in the gym; one that says 77.5 kg is a plan
 * you can follow — provided it is honest about where that number came from,
 * which is why every row carries its source.
 */
export default function PlanLibrary({
  open, onClose, allSets, profile, knownMaxes, onApply,
}: Props) {
  const { t, localizeExercise } = useI18n();
  const [chosen, setChosen] = useState<PlanTemplate | null>(null);
  const [variantIndex, setVariantIndex] = useState(0);

  // The fullest variant by default — for every plan but one this is the only
  // variant there is, and for body part split it preserves what shipped
  // first: five days, with four one tap away rather than the other way round.
  function choose(plan: PlanTemplate) {
    setChosen(plan);
    setVariantIndex(plan.variants.length - 1);
  }

  const variant = chosen?.variants[variantIndex] ?? chosen?.variants[0];

  const byExercise = useMemo(() => {
    const m = new Map<string, SetEntry[]>();
    for (const s of allSets) {
      const list = m.get(s.id);
      if (list) list.push(s);
      else m.set(s.id, [s]);
    }
    return m;
  }, [allSets]);

  /**
   * The best known max for any exercise, not just the one being prescribed —
   * `prescribe`'s `knownMax` parameter. A max set by hand on the stats page
   * wins over one estimated from the log, same rule as `ProgressionPanel`'s
   * training max: it only exists because someone chose to state it, and
   * recomputing from the log would immediately overrule that choice.
   */
  const knownMax = useMemo(() => {
    return (id: string): number | null => {
      const manual = knownMaxes[id]?.max;
      if (manual) return manual;
      const derived = bestEstimate(byExercise.get(id) ?? []);
      return derived ? derived.oneRM : null;
    };
  }, [knownMaxes, byExercise]);

  /**
   * The chosen plan with every weight worked out — computed once, then both
   * shown and applied.
   *
   * Prescribing separately at each of those two moments would let the workout
   * hold a different number from the preview it came from, and the reader would
   * have no way to know which one to believe.
   */
  const resolved = useMemo(() => {
    if (!variant) return null;
    return variant.days.map((day) => ({
      name: day.name,
      exercises: day.exercises.map((e) => {
        const p = prescribe(e.id, e.reps, byExercise.get(e.id) ?? [], profile, knownMax);
        return {
          ...e,
          load: p.source === "unknown" ? undefined : p.load,
          source: p.source,
          relatedTo: p.relatedTo,
        };
      }),
    }));
  }, [variant, byExercise, profile, knownMax]);

  // Only true once something on screen actually needs it explained — a plan
  // built entirely from logged lifts or from body-only exercises never shows
  // the words "starting point" at all, and the note would be answering a
  // question nothing on the page asked. relatedLift gets its own note, since
  // "population average" would be a wrong explanation for a number that came
  // from a real max on a different lift.
  const hasStartingPoint = resolved?.some((day) => day.exercises.some((e) => e.source === "bodyweight"));
  const hasRelatedLift = resolved?.some((day) => day.exercises.some((e) => e.source === "relatedLift"));

  const u = t("unit.kg");
  if (!open) return null;

  return (
    <>
      <button className="workout-scrim" aria-label={t("plans.close")} onClick={onClose} />
      <aside className="plans-panel" aria-label={t("plans.title")}>
        <div className="workout-head">
          <h2>{t("plans.title")}</h2>
          <button className="workout-close" onClick={onClose} aria-label={t("plans.close")}>
            ✕
          </button>
        </div>

        {!chosen ? (
          <>
            <p className="plans-intro">{t("plans.intro")}</p>
            {PLANS.map((p) => {
              // The card shows the default variant's numbers — the fullest
              // one, same as what opening the plan lands on.
              const v = p.variants[p.variants.length - 1];
              return (
                <button key={p.id} className="plan-card" onClick={() => choose(p)}>
                  <span className="pname">{t(`plans.${p.id}.name`)}</span>
                  <span className="pmeta">
                    {t("plans.perWeek", { count: v.perWeek })} · {t("plans.days", { count: v.days.length })}
                  </span>
                  <span className="pdesc">{t(`plans.${p.id}.desc`)}</span>
                </button>
              );
            })}
          </>
        ) : (
          <>
            <button className="plans-back" onClick={() => setChosen(null)}>
              ‹ {t("plans.back")}
            </button>
            <p className="plan-name">{t(`plans.${chosen.id}.name`)}</p>

            {/* Only when there is a real choice — most plans have exactly one
                variant, and a selector offering one option is not a choice,
                it's a decoy. */}
            {chosen.variants.length > 1 && (
              <div className="plan-frequency">
                <span className="plan-frequency-label">{t("plans.frequency")}</span>
                <div className="chip-row">
                  {chosen.variants.map((v, i) => (
                    <button
                      key={v.perWeek}
                      type="button"
                      className={`chip ${i === variantIndex ? "chip-selected" : ""}`}
                      onClick={() => setVariantIndex(i)}
                    >
                      {v.perWeek}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {resolved?.map((day) => (
              <div className="plan-day" key={day.name}>
                <h3>{t(`plans.day.${day.name}`)}</h3>
                <ul>
                  {day.exercises.map((e) => {
                    const raw = BY_ID.get(e.id);
                    if (!raw) return null;
                    const x = localizeExercise(raw);
                    const anchorRaw = e.relatedTo ? BY_ID.get(e.relatedTo) : undefined;
                    const anchorName = anchorRaw ? localizeExercise(anchorRaw).name : "";
                    return (
                      <li key={e.id}>
                        <span className="dname">{x.name}</span>
                        <span className="dload">
                          {e.source === "unknown" ? (
                            <em className="unknown">{t("plans.pickYourOwn")}</em>
                          ) : (
                            <>
                              <strong>
                                {e.load} {u}
                                {/* Same ambiguity as in the logger, and the
                                    preview is where the number is first seen:
                                    a dumbbell figure read as the pair would
                                    halve the work. */}
                                {raw.equipment === "dumbbell" && (
                                  <span className="per-hand"> {t("load.perHand")}</span>
                                )}
                              </strong>
                              <em className={e.source}>
                                {e.source === "relatedLift"
                                  ? t("plans.from.relatedLift", { lift: anchorName })
                                  : t(`plans.from.${e.source}`)}
                              </em>
                            </>
                          )}
                        </span>
                        <span className="dsets">
                          {e.sets} × {e.reps}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {/* Said once, plainly, above the button that commits to it. */}
            {hasStartingPoint && <p className="plan-note flag">{t("plans.startingNote")}</p>}
            {hasRelatedLift && <p className="plan-note flag">{t("plans.relatedNote")}</p>}
            <p className="plan-note">{t("plans.loggedNote")}</p>
            {/* The weights above are not just a preview any more — they go into
                the workout, where the logger offers them back set by set. */}
            <p className="plan-note">{t("plans.carryNote")}</p>

            <button
              className="primary-button"
              onClick={() => {
                if (resolved) onApply(resolved);
                setChosen(null);
                onClose();
              }}
            >
              {t("plans.use", { count: variant?.days.length ?? 0 })}
            </button>
          </>
        )}
      </aside>
    </>
  );
}
