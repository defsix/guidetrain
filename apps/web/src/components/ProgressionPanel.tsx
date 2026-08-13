import { useMemo, useState } from "react";
import type { SetEntry } from "../state/useLog";
import {
  bestEstimate, cycle, cyclesTo, incrementFor, roundLoad, trainingMax,
  MAX_REPS_FOR_ESTIMATE, TRAINING_MAX_FRACTION, SMALLEST_PLATE,
} from "../lib/progression";
import { useI18n } from "../i18n/I18nProvider";

type Props = {
  name: string;
  sets: SetEntry[];
  usesLegs: boolean;
  barbell: boolean;
  onClose: () => void;
};

/**
 * The way from the max you have to the max you want, in weeks and kilos.
 *
 * Everything shown is derived from sets that were actually recorded. There is
 * no field for typing in a max, which is the point: an estimate from a set you
 * performed is a calculation, a number you typed is a claim, and a plan that
 * cannot tell them apart will happily build eight weeks on top of a guess.
 */
export default function ProgressionPanel({
  name, sets, usesLegs, barbell, onClose,
}: Props) {
  const { t } = useI18n();
  const best = useMemo(() => bestEstimate(sets), [sets]);
  const increment = incrementFor(usesLegs);

  const currentMax = best ? roundLoad(best.oneRM) : 0;
  const [target, setTarget] = useState(() =>
    best ? String(roundLoad(best.oneRM + increment * 2)) : "",
  );

  const targetNum = parseFloat(target.replace(",", "."));
  const tm = best ? trainingMax(best.oneRM) : 0;
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

  const u = t("unit.kg");

  return (
    <>
      <button className="workout-scrim" aria-label={t("plan.close")} onClick={onClose} />
      <aside className="plan-panel" aria-label={t("plan.title")}>
        <div className="workout-head">
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

            <p className="plan-tm">
              {t("plan.trainingMax", {
                tm,
                unit: u,
                percent: Math.round(TRAINING_MAX_FRACTION * 100),
              })}
            </p>

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
                {weeks.map((w) => (
                  <tr key={w.label} className={w.deload ? "deload" : ""}>
                    <th scope="row">{t(`plan.${w.label}`)}</th>
                    {w.sets.map((s, i) => (
                      <td key={i}>
                        {s.load} <span className="cap">{u}</span> × {s.reps}
                        {s.amrap && <sup title={t("plan.amrapHelp")}>+</sup>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

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
