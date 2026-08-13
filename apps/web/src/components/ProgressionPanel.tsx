import { useMemo, useState } from "react";
import type { SetEntry, Unit } from "../state/useLog";
import {
  bestEstimate, cycle, cyclesTo, incrementFor, roundLoad, trainingMax,
  MAX_REPS_FOR_ESTIMATE, TRAINING_MAX_FRACTION,
} from "../lib/progression";
import { useI18n } from "../i18n/I18nProvider";

type Props = {
  name: string;
  sets: SetEntry[];
  usesLegs: boolean;
  barbell: boolean;
  unit: Unit;
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
  name, sets, usesLegs, barbell, unit, onClose,
}: Props) {
  const { t } = useI18n();
  const best = useMemo(() => bestEstimate(sets), [sets]);
  const increment = incrementFor(usesLegs, unit);

  const currentMax = best ? roundLoad(best.oneRM, unit) : 0;
  const [target, setTarget] = useState(() =>
    best ? String(roundLoad(best.oneRM + increment * 2, unit)) : "",
  );

  const targetNum = parseFloat(target.replace(",", "."));
  const tm = best ? trainingMax(best.oneRM, unit) : 0;
  const targetTM = Number.isFinite(targetNum) ? trainingMax(targetNum, unit) : 0;
  const cycles = cyclesTo(tm, targetTM, increment);
  const weeks = useMemo(() => cycle(tm, unit), [tm, unit]);
  const u = t(`unit.${unit}`, undefined, unit);

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

            <p className="plan-note">{t("plan.amrapNote")}</p>
            {!barbell && <p className="plan-note">{t("plan.barbellNote")}</p>}
            <p className="plan-note">{t("plan.estimateNote")}</p>
          </>
        )}
      </aside>
    </>
  );
}
