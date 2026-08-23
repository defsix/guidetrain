import { useMemo, useState } from "react";
import exercises from "../anatomy/exercises.json";
import { PLANS, prescribe, prescribePercent } from "../lib/plans";
import type { PlanTemplate } from "../lib/plans";
import { bestEstimate, mainLiftWeek1, goalPace, incrementFor } from "../lib/progression";
import { usesLegs } from "../lib/muscleRegions";
import { goalPaceMessage, goalDateLabel } from "../lib/goalMessage";
import { injuryFor } from "../lib/injuries";
import { injuryNote } from "../lib/injuryMessage";
import type { SetEntry } from "../state/useLog";
import type { KnownMaxEntry } from "../state/useKnownMax";
import type { AppliedDay } from "../state/usePrograms";
import type { TrainingMaxOverride } from "../state/useTrainingMax";
import type { Goal } from "../state/useGoals";
import type { Injury } from "../state/useInjuries";
import type { Profile } from "../types";
import { useI18n } from "../i18n/I18nProvider";
import { useSwipeDismiss } from "../state/useSwipeDismiss";

type Entry = {
  id: string;
  name: string;
  equipment?: string;
  instructions: string[];
  primary: string[];
  secondary: string[];
};

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
  /** A training max set by hand, per exercise id — same store ProgressionPanel reads. */
  trainingMaxes: Record<string, TrainingMaxOverride>;
  /** Goals set on the Stats page, per exercise id — each shown as its own pace note on that row. */
  goals: Record<string, Goal[]>;
  /** Injuries marked on the Stats page, per muscle id — flagged on any row whose primary muscle matches. */
  injuries: Record<string, Injury>;
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
  open, onClose, allSets, profile, knownMaxes, trainingMaxes, goals, injuries, onApply,
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
        if (e.mainLift) {
          // This row's weight comes from the lift's own 5/3/1 cycle, not
          // from `prescribe()` — the same training max ProgressionPanel
          // already reads, so applying this plan and opening Plan → on the
          // lift afterwards agree with each other rather than each keeping
          // a separate number.
          const week1 = mainLiftWeek1(byExercise.get(e.id) ?? [], trainingMaxes[e.id]?.tm);
          if (!week1) {
            return { ...e, load: undefined, source: "unknown" as const, relatedTo: undefined };
          }
          return {
            ...e,
            sets: week1.length,
            reps: Math.max(...week1.map((s) => s.reps)),
            load: week1[week1.length - 1].load,
            steps: week1,
            source: "cycle" as const,
            relatedTo: undefined,
          };
        }
        if (e.pct) {
          // A Russian-cycle row: a literal percent of a max, not `prescribe`'s
          // Epley-derived working weight — see `prescribePercent`.
          const p = prescribePercent(e.id, e.pct, byExercise.get(e.id) ?? [], knownMax);
          return {
            ...e,
            load: p.source === "unknown" ? undefined : p.load,
            source: p.source,
            relatedTo: undefined,
          };
        }
        const p = prescribe(e.id, e.reps, byExercise.get(e.id) ?? [], profile, knownMax);
        return {
          ...e,
          load: p.source === "unknown" ? undefined : p.load,
          source: p.source,
          relatedTo: p.relatedTo,
        };
      }),
    }));
  }, [variant, byExercise, profile, knownMax, trainingMaxes]);

  // Only true once something on screen actually needs it explained — a plan
  // built entirely from logged lifts or from body-only exercises never shows
  // the words "starting point" at all, and the note would be answering a
  // question nothing on the page asked. relatedLift and knownMax each get
  // their own note, since "population average" would be a wrong explanation
  // for either — one is a real max on a different lift, the other a real max
  // on this one that just hasn't been logged here yet.
  const hasStartingPoint = resolved?.some((day) => day.exercises.some((e) => e.source === "bodyweight"));
  const hasRelatedLift = resolved?.some((day) => day.exercises.some((e) => e.source === "relatedLift"));
  const hasKnownMax = resolved?.some((day) => day.exercises.some((e) => e.source === "knownMax"));
  // Shown for the 531 plan specifically rather than derived from what's on
  // screen: even a lift with no training max yet (rendered "unknown", same
  // as any other row with nothing to go on) is a 531 main lift, and the note
  // is exactly what explains why opening Plan → on it after adding the
  // workout is the way to fix that.
  const isCyclePlan = chosen?.variants.some((v) => v.days.some((d) => d.exercises.some((e) => e.mainLift)));
  // Same idea for the Russian routines: every one of the eighteen sessions
  // is a genuinely different weight, computed as a percent of a max rather
  // than estimated from a rep count, and that is worth saying once rather
  // than leaving each session's number looking arbitrary next to the last.
  const isPercentPlan = chosen?.variants.some((v) => v.days.some((d) => d.exercises.some((e) => e.pct)));

  const u = t("unit.kg");
  const swipe = useSwipeDismiss(onClose);
  if (!open) return null;

  return (
    <>
      <button className="workout-scrim" aria-label={t("plans.close")} onClick={onClose} />
      <aside className="plans-panel" aria-label={t("plans.title")}>
        <div className={`workout-head ${swipe.dragging ? "dragging" : ""}`} {...swipe.handleProps}>
          <span className="sheet-handle" aria-hidden="true" />
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
                    const exerciseGoals = goals[e.id] ?? [];
                    const paced = exerciseGoals.map((goal) => ({
                      goal,
                      pace: goalPace(
                        byExercise.get(e.id) ?? [],
                        trainingMaxes[e.id]?.tm,
                        goal.targetWeight,
                        goal.targetDate,
                        incrementFor(usesLegs(raw)),
                      ),
                    }));
                    const injury = injuryFor(raw, injuries);
                    const injuredMuscleName = injury
                      ? t(`muscles.${injury.muscle}.name`, undefined, injury.muscle)
                      : "";
                    return (
                      <li key={e.id}>
                        <span className="dname">{x.name}</span>
                        <span className="dload">
                          {e.source === "unknown" ? (
                            <em className="unknown">{t("plans.pickYourOwn")}</em>
                          ) : e.source === "cycle" && e.steps ? (
                            // A 5/3/1 main lift's three sets are deliberately
                            // not the same weight, unlike every other row
                            // here — showing one figure would claim they are.
                            <>
                              <strong>
                                {e.steps.map((s) => s.load).join(" / ")} {u}
                              </strong>
                              <em className="cycle">{t("plans.from.cycle")}</em>
                            </>
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
                        {paced.map(({ goal, pace }) => (
                          <span className="dgoal" key={goal.id}>
                            {t("stats.goals.by", { date: goalDateLabel(goal.targetDate) })}
                            {": "}
                            {goal.targetWeight} {u}
                            {" — "}
                            {goalPaceMessage(t, pace)}
                          </span>
                        ))}
                        {injury && (
                          <span className={`dinjury dinjury-${injury.mode}`}>
                            {injuryNote(t, injury.mode, injuredMuscleName)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {/* Said once, plainly, above the button that commits to it. */}
            {hasStartingPoint && <p className="plan-note flag">{t("plans.startingNote")}</p>}
            {hasKnownMax && <p className="plan-note flag">{t("plans.knownMaxNote")}</p>}
            {hasRelatedLift && <p className="plan-note flag">{t("plans.relatedNote")}</p>}
            {isCyclePlan && <p className="plan-note flag">{t("plans.cycleNote")}</p>}
            {isPercentPlan && <p className="plan-note flag">{t("plans.percentNote")}</p>}
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
