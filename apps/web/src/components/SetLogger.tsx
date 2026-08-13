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
  /**
   * Body weight in the logging unit, passed only for exercises whose load *is*
   * the person. Its presence is what puts this in reps-only mode: there is no
   * separate flag, because a bodyweight exercise with no known body weight has
   * nothing to record as a load and has to ask for one.
   */
  bodyLoad?: number;
};

/**
 * Record one set against one exercise.
 *
 * Two number fields and a button, because that is the whole interaction and it
 * happens between sets with one hand. `inputMode="decimal"` puts a phone on the
 * number pad without the field rejecting the comma decimal separator that half
 * these languages use.
 *
 * A push-up asks for reps alone. Its load is the person doing it, which the app
 * already knows, so a weight field there is a question with only one honest
 * answer — and one more thing to type while holding a phone mid-set. The weight
 * is still *recorded*, so the set reads "82 kg × 10" like any other and counts
 * towards a plan; it just isn't asked for.
 */
export default function SetLogger({
  exerciseId, unit, todaysSets, best, onAdd, onRemove, onPlan, bodyLoad,
}: Props) {
  const { t } = useI18n();
  const repsOnly = bodyLoad != null;
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  // A comma is the decimal separator in most of the ten languages, and
  // parseFloat("62,5") silently returns 62. Take either.
  const num = (s: string) => parseFloat(s.replace(",", "."));
  const load = repsOnly ? bodyLoad : num(weight);
  const ready = Number.isFinite(load) && num(reps) > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    onAdd(exerciseId, load as number, Math.round(num(reps)));
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
        {!repsOnly && (
          <>
            <input
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              inputMode="decimal"
              placeholder={t(`unit.${unit}`, undefined, unit)}
              aria-label={t("log.weight")}
              maxLength={6}
            />
            <span className="by">×</span>
          </>
        )}
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

      {/* Says where the load came from, so a set that appears as "82 kg × 10"
          after typing only "10" is explained rather than surprising. */}
      {repsOnly && (
        <p className="body-load">
          {t("log.atBodyWeight", {
            weight: bodyLoad,
            unit: t(`unit.${unit}`, undefined, unit),
          })}
        </p>
      )}

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
