import { useEffect, useState } from "react";
import type { SetEntry } from "../state/useLog";
import type { Target } from "../state/usePrograms";
import { platesPerSide, BAR_WEIGHT } from "../lib/progression";
import { useI18n } from "../i18n/I18nProvider";

type Props = {
  exerciseId: string;
  todaysSets: SetEntry[];
  best?: SetEntry;
  onAdd: (id: string, weight: number, reps: number) => void;
  onRemove: (uid: string) => void;
  onPlan: () => void;
  /**
   * The target, which may carry a prescribed weight for each set — from a
   * ready-made plan or from a week of the 5/3/1 cycle.
   */
  target?: Target;
  /** Sets skipped today. They advance the prescription and log nothing. */
  skipped?: number;
  onSkipSet?: () => void;
  onSkipRest?: () => void;
  onUnskip?: () => void;
  /** The written instructions, shown on request rather than by default. */
  instructions?: string[];
  /**
   * What the exercise is done with, from the catalogue.
   *
   * Drives what the weight on screen *means*, which differs by kit and was
   * being left to the reader to assume: a barbell number is the whole bar and
   * has to be halved and made from plates, a dumbbell number is one hand.
   */
  equipment?: string;
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
 *
 * When the target carries prescribed sets, the fields arrive already holding
 * the next one. That is the whole point of the two planners: a weight you have
 * to remember from another screen is a weight you get wrong under a bar.
 */
export default function SetLogger({
  exerciseId, todaysSets, best, onAdd, onRemove, onPlan, bodyLoad, target,
  skipped = 0, onSkipSet, onSkipRest, onUnskip, instructions, equipment,
}: Props) {
  const { t } = useI18n();
  const repsOnly = bodyLoad != null;
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [showHow, setShowHow] = useState(false);

  // Which prescribed set is next: the sets already logged today plus any
  // skipped are the ones dealt with, so position in the prescription is
  // position in the log offset by the skips. Undefined once the prescription
  // runs out, which is not an error — a fourth set on a target of three is a
  // thing people do, and it logs as normal.
  const steps = target?.steps;
  const logged = todaysSets.length;
  const done = logged + skipped;
  const next = steps?.[done];
  const remaining = target ? Math.max(0, target.sets - done) : 0;
  const nextLoad = next?.load;
  const nextReps = next?.reps;

  /**
   * Fill the fields with the set that is due.
   *
   * Keyed on the prescription rather than run on every render, so typing over
   * it sticks: the fields are only rewritten when the set being asked for
   * changes — on opening the workout, on logging a set, and on taking a
   * different week from the plan. Anything typed in between is left alone.
   *
   * `done` earns its place in the list even though the body never reads it.
   * Submitting clears the reps field, and a straight-set plan asks for the same
   * weight and reps every set, so without it the second set of 3 × 5 would
   * advance the position, change nothing the effect watches, and leave the reps
   * field empty for a prescription that had not changed.
   */
  useEffect(() => {
    if (nextReps == null) return;
    if (nextLoad != null) setWeight(String(nextLoad));
    setReps(String(nextReps));
  }, [nextLoad, nextReps, done, exerciseId]);

  // A comma is the decimal separator in most of the ten languages, and
  // parseFloat("62,5") silently returns 62. Take either.
  const num = (s: string) => parseFloat(s.replace(",", "."));
  const load = repsOnly ? bodyLoad : num(weight);
  const ready = Number.isFinite(load) && num(reps) > 0;

  /**
   * How to make the weight in the field, for kit where the number is not the
   * thing you pick up.
   *
   * Driven by the field rather than by the prescription, so it answers the
   * question for a weight you typed as well as one you were handed — the
   * arithmetic is the same either way and it is the arithmetic people get
   * wrong at the rack.
   */
  const loading = equipment === "barbell" && Number.isFinite(load)
    ? platesPerSide(load as number)
    : null;
  const barOnly = equipment === "barbell" && load === BAR_WEIGHT;

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
              {s.weight} {t("unit.kg")} × {s.reps}
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

      {/* The whole prescribed session at a glance, with the set you are on
          marked — so the number in the field can be checked against something
          rather than taken on trust, and so you can see what is still to come. */}
      {steps && (
        <p className="prescribed">
          <span className="steps">
            {steps.map((s, i) => (
              // Done, skipped, doing, still to come. Skipped is its own state
              // rather than a shade of done, because it is the opposite claim:
              // nothing was lifted for it. Skips are taken from the set you are
              // on, so they always sit between the logged sets and the current
              // one.
              <span
                key={i}
                className={i < logged ? "was" : i < done ? "skipped" : i === done ? "now" : ""}
              >
                {s.load != null && `${s.load} ${t("unit.kg")} × `}
                {s.reps}
                {s.amrap && <sup title={t("plan.amrapHelp")}>+</sup>}
              </span>
            ))}
          </span>
          <em>{t(`target.from.${target?.source ?? "plan"}`)}</em>
        </p>
      )}

      <form className="log-form" onSubmit={submit}>
        {!repsOnly && (
          <>
            <input
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              inputMode="decimal"
              placeholder={t("unit.kg")}
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

      {/* What the number on screen actually means, which is not the same
          question for every piece of kit. A barbell's 100 kg is the whole
          loaded bar and nobody hands you one — you build it from a 20 kg bar
          and pairs of plates, and the halving is where people slip. A
          dumbbell's 12.5 kg is one hand; taken as the pair it would be half
          the weight it should be. Neither was said anywhere. */}
      {loading && (
        <p className="loading-note">
          {t("load.perSide", { weight: loading.side, unit: t("unit.kg") })}
          <span className="plates">
            {loading.plates.map((p, i) => (
              <span key={i}>{p}</span>
            ))}
          </span>
        </p>
      )}
      {barOnly && <p className="loading-note">{t("load.barOnly")}</p>}
      {equipment === "dumbbell" && <p className="loading-note">{t("load.perHand")}</p>}

      {/* Skipping, which records nothing. A set you did not do is not a set,
          so this moves the prescription on and says so — it never reaches the
          log. Only offered while there is something left to skip. */}
      {remaining > 0 && (onSkipSet || onSkipRest) && (
        <p className="skip-row">
          {onSkipSet && (
            <button className="skip" onClick={onSkipSet}>
              {t("skip.set")}
            </button>
          )}
          {/* Only once there is more than one left, since "skip the rest" and
              "skip this set" would otherwise be two buttons doing one thing. */}
          {onSkipRest && remaining > 1 && (
            <button className="skip" onClick={onSkipRest}>
              {t("skip.rest")}
            </button>
          )}
        </p>
      )}

      {skipped > 0 && (
        <p className="skipped-note">
          {t("skip.done", { count: skipped })}
          {onUnskip && (
            <button className="skip-undo" onClick={onUnskip}>
              {t("skip.undo")}
            </button>
          )}
        </p>
      )}

      {/* Says where the load came from, so a set that appears as "82 kg × 10"
          after typing only "10" is explained rather than surprising. */}
      {repsOnly && (
        <p className="body-load">
          {t("log.atBodyWeight", { weight: bodyLoad, unit: t("unit.kg") })}
        </p>
      )}

      {best && (
        <p className="best">
          {t("log.best")} {best.weight} {t("unit.kg")} × {best.reps}
          {/* Only offered once there is a set to work from, since the plan is
              built from recorded lifts and has nothing to say without one. */}
          <button className="plan-link" onClick={onPlan}>
            {t("plan.open")}
          </button>
        </p>
      )}

      {/* How to do it, in the workout rather than only on the muscle screen.
          Collapsed by default: it is reference, wanted on the first session
          with a lift and never again, and eight steps open on every exercise
          would bury the sets under prose. */}
      {instructions && instructions.length > 0 && (
        <div className="how">
          <button
            className="how-toggle"
            onClick={() => setShowHow((v) => !v)}
            aria-expanded={showHow}
          >
            {showHow ? "▾" : "▸"} {t("log.howTo")}
          </button>
          {showHow && (
            <ol className="how-steps">
              {instructions.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
