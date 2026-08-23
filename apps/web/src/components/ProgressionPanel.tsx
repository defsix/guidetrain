import { useMemo, useState } from "react";
import type { SetEntry } from "../state/useLog";
import {
  bestEstimate, cycle, cyclesTo, goalPace, incrementFor, roundLoad, trainingMax,
  reviewCycle, resetTrainingMax, RESET_FRACTION,
  MAX_REPS_FOR_ESTIMATE, TRAINING_MAX_FRACTION, SMALLEST_PLATE,
} from "../lib/progression";
import type { TrainingMaxOverride } from "../state/useTrainingMax";
import type { PlannedWeek } from "../lib/progression";
import type { Target } from "../state/usePrograms";
import type { Goal } from "../state/useGoals";
import { goalPaceMessage, goalDateLabel } from "../lib/goalMessage";
import { useI18n } from "../i18n/I18nProvider";
import { useSwipeDismiss } from "../state/useSwipeDismiss";

type Props = {
  name: string;
  sets: SetEntry[];
  usesLegs: boolean;
  barbell: boolean;
  onClose: () => void;
  /**
   * This exercise's current workout target, so a week already taken is shown
   * as taken. Named for the workout rather than just `target`, which in this
   * panel is the max you are training towards.
   */
  workoutTarget?: Target;
  /** Puts one week's loads into the workout as the target for this exercise. */
  onUseWeek: (t: Target) => void;
  /** Bodyweight work: the reps are the prescription, the loads mean nothing. */
  repsOnly?: boolean;
  /** A training max set by hand, which beats the one derived from the log. */
  override?: TrainingMaxOverride;
  onSetTrainingMax: (tm: number, from: number) => void;
  onClearTrainingMax: () => void;
  /** Every goal set for this exercise on the Stats page — each shown as its own pace verdict. */
  goals?: Goal[];
};

/**
 * One week of the cycle, as a target the workout can carry.
 *
 * `reps` is the largest of the three rather than the first, because it is what
 * the plain "3 × 5" label falls back to when there is nothing more specific to
 * say. A 5/3/1 week is 5, 3 and 1, and the pips render per set regardless.
 */
function weekTarget(w: PlannedWeek, repsOnly: boolean): Target {
  return {
    sets: w.sets.length,
    reps: Math.max(...w.sets.map((s) => s.reps)),
    steps: w.sets.map((s) => ({
      ...(repsOnly ? {} : { load: s.load }),
      reps: s.reps,
      ...(s.amrap ? { amrap: true as const } : {}),
    })),
    source: "cycle",
  };
}

/** Whether the workout is already carrying exactly this week. */
function isApplied(target: Target | undefined, w: Target): boolean {
  if (target?.source !== "cycle" || target.steps?.length !== w.steps?.length) return false;
  return (target.steps ?? []).every(
    (s, i) => s.load === w.steps![i].load && s.reps === w.steps![i].reps,
  );
}

/**
 * The way from the max you have to the max you want, in weeks and kilos.
 *
 * Everything shown is derived from sets that were actually recorded. There is
 * no field for typing in a max, which is the point: an estimate from a set you
 * performed is a calculation, a number you typed is a claim, and a plan that
 * cannot tell them apart will happily build eight weeks on top of a guess.
 */
export default function ProgressionPanel({
  name, sets, usesLegs, barbell, onClose, workoutTarget, onUseWeek, repsOnly = false,
  override, onSetTrainingMax, onClearTrainingMax, goals = [],
}: Props) {
  const { t } = useI18n();
  const best = useMemo(() => bestEstimate(sets), [sets]);
  const increment = incrementFor(usesLegs);

  // Reuses the exact function the Stats page's goal list calls, so a goal
  // reads the same pace here as it does there — one calculation, not two
  // that could quietly disagree. One verdict per goal: two goals on the same
  // lift are two different questions, not a disagreement to resolve.
  const paced = useMemo(
    () => goals.map((goal) => ({
      goal,
      pace: goalPace(sets, override?.tm, goal.targetWeight, goal.targetDate, increment),
    })),
    [goals, sets, override, increment],
  );

  const currentMax = best ? roundLoad(best.oneRM) : 0;
  const [target, setTarget] = useState(() =>
    best ? String(roundLoad(best.oneRM + increment * 2)) : "",
  );

  const targetNum = parseFloat(target.replace(",", "."));
  // A training max set by hand wins over the derived one. It only exists
  // because someone stalled and chose to back off, and recomputing it from the
  // log would immediately undo that decision.
  const derivedTM = best ? trainingMax(best.oneRM) : 0;
  const tm = override ? override.tm : derivedTM;
  const targetTM = Number.isFinite(targetNum) ? trainingMax(targetNum) : 0;
  const cycles = cyclesTo(tm, targetTM, increment);

  // Which cycle's numbers the table is showing. The four weeks repeat with a
  // higher training max each time, and showing only the first left the panel
  // promising eight weeks while displaying four — the question anyone would
  // ask, and the app had no answer on screen.
  const [shown, setShown] = useState(1);
  const total = Math.max(1, cycles);
  const at = Math.min(shown, total);
  const cycleTM = tm + increment * (at - 1);
  const weeks = useMemo(() => cycle(cycleTM), [cycleTM]);

  /**
   * Whether this cycle asks for exactly the weights the last one did.
   *
   * It can, and it is not a bug in the plan. A cycle's increase is applied to
   * the training max, and what reaches the bar is a percentage of that: 5 kg of
   * training max is only 4.75 kg at 95%. Whenever the bar's step is coarser
   * than that, the increase rounds away and two cycles come out identical —
   * which is exactly what 2.5 kg plates did before the rack was corrected to
   * 1.25 kg. Two identical tables in a row look broken unless the panel says
   * why, and a coarser rack or a smaller increment can bring it back, so the
   * check stays.
   */
  const repeatsPrevious = useMemo(() => {
    if (at <= 1) return false;
    const loads = (ws: ReturnType<typeof cycle>) =>
      ws.map((w) => w.sets.map((x) => x.load).join()).join("|");
    return loads(cycle(cycleTM - increment)) === loads(weeks);
  }, [at, cycleTM, increment, weeks]);

  /**
   * How the cycle on screen actually went, read off the log.
   *
   * Only for the cycle being shown: its loads are what the log is matched
   * against, so stepping to cycle 3 asks about cycle 3's weights.
   */
  // Only work done since the training max was fixed can be an attempt at it:
  // the set the estimate came from must not be allowed to mark the cycle it
  // produced, and after a reset only the rebuild counts.
  const since = override ? override.at : (best?.set.at ?? -Infinity);
  const outcomes = useMemo(() => reviewCycle(weeks, sets, since), [weeks, sets, since]);
  // Narrowed to the shape the stall block needs: `missed` is only ever true
  // for a set that happened, so its rep count is a number, but that is a fact
  // about reviewCycle rather than something the type can carry.
  const stalled = outcomes.find(
    (o): o is typeof o & { achieved: number } => o.missed && o.achieved !== null,
  ) ?? null;

  const u = t("unit.kg");
  const swipe = useSwipeDismiss(onClose);

  return (
    <>
      <button className="workout-scrim" aria-label={t("plan.close")} onClick={onClose} />
      <aside className="plan-panel" aria-label={t("plan.title")}>
        <div className={`workout-head ${swipe.dragging ? "dragging" : ""}`} {...swipe.handleProps}>
          <span className="sheet-handle" aria-hidden="true" />
          <h2>{t("plan.title")}</h2>
          <button className="workout-close" onClick={onClose} aria-label={t("plan.close")}>
            ✕
          </button>
        </div>
        <p className="plan-name">{name}</p>

        {!best ? (
          // Nothing usable to work from. Say what would make it work rather
          // than showing an empty plan.
          <p className="workout-empty">
            {t("plan.needSet", { count: MAX_REPS_FOR_ESTIMATE })}
          </p>
        ) : (
          <>
            <div className="plan-max">
              <span className="figure">
                {currentMax} {u}
              </span>
              <span className="cap">{t("plan.estimated")}</span>
              {/* The set it came from, so the number is checkable rather than
                  something the app just asserts. */}
              <span className="from">
                {t("plan.from", { weight: best.set.weight, unit: u, reps: best.set.reps })}
              </span>
            </div>

            {/* Goals are set on the Stats page, for any exercise — shown here
                too since Plan → is where their pace actually gets judged, the
                same place every other cycle question on this lift lives. */}
            {paced.map(({ goal, pace }) => (
              <p className="plan-note flag" key={goal.id}>
                {t("stats.goals.by", { date: goalDateLabel(goal.targetDate) })}
                {": "}
                {goal.targetWeight} {u}
                {" — "}
                {goalPaceMessage(t, pace)}
              </p>
            ))}

            <label className="plan-target">
              <span>{t("plan.target")}</span>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                inputMode="decimal"
                maxLength={6}
                aria-label={t("plan.target")}
              />
              <span className="cap">{u}</span>
            </label>

            {cycles > 0 ? (
              <p className="plan-answer">
                {/* Named `count`, not `cycles`: the plural form is chosen from a
                    var with that exact name, and anything else silently leaves
                    the message as an object and renders the key. */}
                {t("plan.answer", { count: cycles, weeks: cycles * 4, increment, unit: u })}
              </p>
            ) : (
              <p className="plan-answer">{t("plan.already")}</p>
            )}

            {/* Only while the training max really is 90% of the estimate. Once
                it has been reset by hand it is not, and leaving this line up
                would have the panel assert something false one line above the
                note explaining the truth. */}
            {!override && (
              <p className="plan-tm">
                {t("plan.trainingMax", {
                  tm,
                  unit: u,
                  percent: Math.round(TRAINING_MAX_FRACTION * 100),
                })}
              </p>
            )}

            {/* A training max that differs from what your lifts imply has to
                say so, or the number looks arbitrary. */}
            {override && (
              <p className="plan-note flag">
                {t("plan.tmReset", { from: override.from, tm: override.tm, unit: u })}
                <button className="tm-clear" onClick={onClearTrainingMax}>
                  {t("plan.tmRestore", { tm: derivedTM, unit: u })}
                </button>
              </p>
            )}

            {/* Step through the cycles rather than showing only the first. The
                same four weeks, run at a training max that is `increment`
                higher each time — which is where the progress actually comes
                from, and is worth being able to look at. */}
            {total > 1 && (
              <div className="cycle-nav">
                <button
                  onClick={() => setShown(at - 1)}
                  disabled={at <= 1}
                  aria-label={t("plan.prevCycle")}
                >
                  ‹
                </button>
                <span>{t("plan.cycleOf", { at, total, tm: cycleTM, unit: u })}</span>
                <button
                  onClick={() => setShown(at + 1)}
                  disabled={at >= total}
                  aria-label={t("plan.nextCycle")}
                >
                  ›
                </button>
              </div>
            )}

            <table className="plan-table">
              <tbody>
                {weeks.map((w) => {
                  // The table used to end here, and this is where the plan
                  // stopped being a plan: it showed you 65, 75 and 85 kg and
                  // then left you to remember them at the rack. Taking a week
                  // writes it into the workout as the target, where the logger
                  // offers each set back in turn.
                  const asTarget = weekTarget(w, repsOnly);
                  const on = isApplied(workoutTarget, asTarget);
                  // What the log says about this week's top set. Weeks you have
                  // not reached carry no mark at all — an absent set is not a
                  // failed one.
                  const o = outcomes.find((x) => x.label === w.label);
                  const mark = !o || o.achieved === null || o.ambiguous
                    ? ""
                    : o.missed
                      ? "missed"
                      : "hit";
                  return (
                    <tr
                      key={w.label}
                      className={`${w.deload ? "deload" : ""} ${on ? "using" : ""} ${mark}`}
                    >
                      <th scope="row">{t(`plan.${w.label}`)}</th>
                      {w.sets.map((s, i) => (
                        <td key={i}>
                          {s.load} <span className="cap">{u}</span> × {s.reps}
                          {s.amrap && <sup title={t("plan.amrapHelp")}>+</sup>}
                          {/* The mark goes on the top set, which is the only
                              one the programme judges you on. */}
                          {i === w.sets.length - 1 && mark && o?.achieved != null && (
                            <span
                              className={`week-mark ${mark}`}
                              title={t(mark === "hit" ? "plan.hitTitle" : "plan.missedTitle", {
                                reps: o.achieved,
                                required: o.required,
                              })}
                            >
                              {mark === "hit" ? "✓" : "✕"}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="use-cell">
                        <button
                          className={`use-week ${on ? "on" : ""}`}
                          onClick={() => onUseWeek(asTarget)}
                          aria-label={`${t(on ? "plan.usingWeek" : "plan.useWeek")} — ${t(`plan.${w.label}`)}`}
                        >
                          {t(on ? "plan.usingWeek" : "plan.useWeek")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p className="plan-note">{t("plan.useWeekNote")}</p>

            {/* The part the plan was missing. Everything above describes going
                up; this is the only thing on screen that describes what to do
                when it does not, and a plan that only describes success is the
                one that gets somebody hurt. */}
            {stalled && (
              <div className="stall">
                <p className="stall-head">
                  {t("plan.stalled", {
                    week: t(`plan.${stalled.label}`),
                    reps: stalled.achieved,
                    required: stalled.required,
                    load: stalled.load,
                    unit: u,
                  })}
                </p>
                <p className="stall-why">
                  {t("plan.stallWhy", { percent: Math.round((1 - RESET_FRACTION) * 100) })}
                </p>
                <button
                  className="primary-button"
                  onClick={() => onSetTrainingMax(resetTrainingMax(tm), tm)}
                >
                  {t("plan.resetTo", { tm: resetTrainingMax(tm), unit: u })}
                </button>
              </div>
            )}
            {outcomes.some((o) => o.ambiguous) && (
              <p className="plan-note">{t("plan.ambiguous")}</p>
            )}

            {repeatsPrevious && (
              <p className="plan-note flag">
                {t("plan.sameLoads", { increment, unit: u, plate: SMALLEST_PLATE })}
              </p>
            )}
            {total > 1 && (
              <p className="plan-note">
                {t("plan.repeatNote", { increment, unit: u })}
              </p>
            )}
            {/* Answers the obvious question: why are the weekly jumps so
                small? Because they are supposed to be. */}
            <p className="plan-note">{t("plan.lightNote")}</p>
            <p className="plan-note">{t("plan.amrapNote")}</p>
            {!barbell && <p className="plan-note">{t("plan.barbellNote")}</p>}
            <p className="plan-note">{t("plan.estimateNote")}</p>
          </>
        )}
      </aside>
    </>
  );
}
