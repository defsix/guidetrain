import { useState } from "react";
import type { SetEntry, Unit } from "../state/useLog";
import { useI18n } from "../i18n/I18nProvider";

type Props = {
  exerciseId: string;
  unit: Unit;
  todaysSets: SetEntry[];
  best?: SetEntry;
  onAdd: (id: string, weight: number, reps: number) => void;
  onRemove: (uid: string) => void;
  onPlan: () => void;
};

/**
 * Record one set: a weight and a rep count, against one exercise.
 *
 * Two number fields and a button, because that is the whole interaction and it
 * happens between sets with one hand. `inputMode="decimal"` puts a phone on the
 * number pad without the field rejecting the comma decimal separator that half
 * these languages use.
 */
export default function SetLogger({
  exerciseId, unit, todaysSets, best, onAdd, onRemove, onPlan,
}: Props) {
  const { t } = useI18n();
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  // A comma is the decimal separator in most of the ten languages, and
  // parseFloat("62,5") silently returns 62. Take either.
  const num = (s: string) => parseFloat(s.replace(",", "."));
  const ready = Number.isFinite(num(weight)) && num(reps) > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    onAdd(exerciseId, num(weight), Math.round(num(reps)));
    setReps("");
    // The weight usually repeats across sets and the reps usually don't, so
    // only the reps field is cleared. One less thing to retype mid-session.
  }

  return (
    <div className="logger">
      {todaysSets.length > 0 && (
        <ul className="sets">
          {todaysSets.map((s, i) => (
            <li key={s.uid}>
              <span className="sn">{i + 1}</span>
              {s.weight} {t(`unit.${s.unit}`, undefined, s.unit)} × {s.reps}
              <button
                onClick={() => onRemove(s.uid)}
                aria-label={`${t("log.removeSet")} — ${s.weight} × ${s.reps}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="log-form" onSubmit={submit}>
        <input
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          inputMode="decimal"
          placeholder={t(`unit.${unit}`, undefined, unit)}
          aria-label={t("log.weight")}
          maxLength={6}
        />
        <span className="by">×</span>
        <input
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          inputMode="numeric"
          placeholder={t("log.repsShort")}
          aria-label={t("log.reps")}
          maxLength={3}
        />
        <button type="submit" disabled={!ready}>
          {t("log.addSet")}
        </button>
      </form>

      {best && (
        <p className="best">
          {t("log.best")} {best.weight} {t(`unit.${best.unit}`, undefined, best.unit)} × {best.reps}
          {/* Only offered once there is a set to work from, since the plan is
              built from recorded lifts and has nothing to say without one. */}
          <button className="plan-link" onClick={onPlan}>
            {t("plan.open")}
          </button>
        </p>
      )}
    </div>
  );
}
