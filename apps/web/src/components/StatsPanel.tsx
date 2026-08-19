import { useMemo, useState } from "react";
import exercisesData from "../anatomy/exercises.json";
import type { Profile } from "../types";
import type { SetEntry } from "../state/useLog";
import type { WeighIn } from "../state/useBodyWeightLog";
import type { KnownMaxEntry } from "../state/useKnownMax";
import type { TrainingMaxOverride } from "../state/useTrainingMax";
import type { Goal } from "../state/useGoals";
import type { Injury, InjuryMode } from "../state/useInjuries";
import { bestEstimate, roundLoad, incrementFor, goalPace } from "../lib/progression";
import { usesLegs, MUSCLES } from "../lib/muscleRegions";
import { goalPaceMessage, goalDateLabel } from "../lib/goalMessage";
import { useI18n } from "../i18n/I18nProvider";

type CatalogueEntry = {
  id: string;
  name: string;
  instructions: string[];
  primary: string[];
  secondary: string[];
};

// Every exercise, one entry each — the goal picker offers the whole
// catalogue, not just the three lifts this panel otherwise tracks.
const ALL_EXERCISES: CatalogueEntry[] = (() => {
  const seen = new Map<string, CatalogueEntry>();
  for (const list of Object.values(exercisesData.muscles as Record<string, CatalogueEntry[]>)) {
    for (const x of list) if (!seen.has(x.id)) seen.set(x.id, x);
  }
  return [...seen.values()];
})();
const BY_ID = new Map(ALL_EXERCISES.map((x) => [x.id, x]));

type Props = {
  open: boolean;
  onClose: () => void;
  profile: Profile | null;
  onSetBodyWeight: (kg: number) => void;
  weighIns: WeighIn[];
  allSets: SetEntry[];
  knownMaxes: Record<string, KnownMaxEntry>;
  onSetKnownMax: (id: string, max: number, from: number | null) => void;
  onClearKnownMax: (id: string) => void;
  /** Training maxes set by hand — goalPace prefers these the same way ProgressionPanel does. */
  trainingMaxes: Record<string, TrainingMaxOverride>;
  goals: Record<string, Goal>;
  onSetGoal: (id: string, targetWeight: number, targetDate: number) => void;
  onClearGoal: (id: string) => void;
  injuries: Record<string, Injury>;
  onSetInjury: (muscleId: string, mode: InjuryMode) => void;
  onClearInjury: (muscleId: string) => void;
};

/**
 * The three lifts this panel tracks a max for, in the order shown.
 *
 * The same ids `plans.ts`'s `RELATED_TO` anchors on — a max set here is what
 * feeds a starting weight for Incline Bench and Close-Grip Bench when neither
 * has its own log yet.
 */
const LIFTS: { id: string; key: string }[] = [
  { id: "Barbell_Squat", key: "squat" },
  { id: "Barbell_Bench_Press_-_Medium_Grip", key: "bench" },
  { id: "Barbell_Deadlift", key: "deadlift" },
];

/** A short date for a chart's axis — day and month only, no year, no weekday. */
function short(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

type Point = { at: number; value: number };

/**
 * A minimal line chart, hand-rolled: no charting library for what is a
 * handful of points on two axes, in keeping with everything else in this
 * app's dependency budget. One series, one colour — `--accent`, the app's
 * only one — since the four of these differ by which section they sit under,
 * not by a colour key nobody asked to learn.
 */
function Trend({ points, unit, empty }: { points: Point[]; unit: string; empty: string }) {
  if (points.length === 0) return <p className="stats-chart-empty">{empty}</p>;

  const W = 280;
  const H = 64;
  const PAD = 8;

  if (points.length === 1) {
    const [p] = points;
    return (
      <svg className="stats-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${p.value} ${unit}`}>
        <circle cx={W / 2} cy={H / 2} r="3" className="stats-chart-dot" />
        <text x={W / 2} y={H / 2 - 10} textAnchor="middle" className="stats-chart-value">
          {p.value} {unit}
        </text>
      </svg>
    );
  }

  const values = points.map((p) => p.value);
  const ats = points.map((p) => p.at);
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  // A flat line (every value identical) needs a fake span or every point
  // lands on the same y and the line vanishes into the axis.
  const vSpan = vMax - vMin || 1;
  const tMin = Math.min(...ats);
  const tMax = Math.max(...ats);
  const tSpan = tMax - tMin || 1;

  const x = (at: number) => PAD + ((at - tMin) / tSpan) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - vMin) / vSpan) * (H - PAD * 2);

  const path = points.map((p) => `${x(p.at)},${y(p.value)}`).join(" ");
  const last = points[points.length - 1];

  return (
    <svg className="stats-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${last.value} ${unit}`}>
      <polyline points={path} className="stats-chart-line" />
      {points.map((p, i) => (
        <circle key={i} cx={x(p.at)} cy={y(p.value)} r="2.5" className="stats-chart-dot" />
      ))}
      <text x={PAD} y={12} className="stats-chart-axis">{short(tMin)}</text>
      <text x={W - PAD} y={12} textAnchor="end" className="stats-chart-axis">{short(tMax)}</text>
      <text x={x(last.at)} y={y(last.value) - 8} textAnchor="end" className="stats-chart-value">
        {last.value} {unit}
      </text>
    </svg>
  );
}

/**
 * Body weight, and a max for each of the three lifts the rest of the app
 * already reasons about — see `plans.ts` and `useKnownMax.ts`.
 *
 * A max here is deliberately editable with nothing to back it: unlike the
 * 5/3/1 planner (`ProgressionPanel`), which refuses a typed-in number because
 * it drives eight weeks of percentages, this is closer to "tell the app what
 * you already know about yourself" — the same trust the onboarding form
 * already extends to a typed body weight. It still says plainly which
 * number is which, the same way a `Prescription`'s `source` does.
 */
export default function StatsPanel({
  open, onClose, profile, onSetBodyWeight, weighIns, allSets,
  knownMaxes, onSetKnownMax, onClearKnownMax,
  trainingMaxes, goals, onSetGoal, onClearGoal,
  injuries, onSetInjury, onClearInjury,
}: Props) {
  const { t, localizeExercise } = useI18n();
  const [weightInput, setWeightInput] = useState("");
  const [maxInputs, setMaxInputs] = useState<Record<string, string>>({});
  const [goalExercise, setGoalExercise] = useState("");
  const [goalWeightInput, setGoalWeightInput] = useState("");
  const [goalDateInput, setGoalDateInput] = useState("");

  const setsById = useMemo(() => {
    const m = new Map<string, SetEntry[]>();
    for (const s of allSets) {
      const list = m.get(s.id);
      if (list) list.push(s);
      else m.set(s.id, [s]);
    }
    return m;
  }, [allSets]);

  // Localized once per language change rather than per keystroke in the
  // picker — the catalogue itself never changes, only its names do.
  const localizedExercises = useMemo(
    () => ALL_EXERCISES.map((x) => localizeExercise(x)),
    [localizeExercise],
  );
  const idByName = useMemo(
    () => new Map(localizedExercises.map((x) => [x.name, x.id])),
    [localizedExercises],
  );

  if (!open) return null;

  const u = t("unit.kg");
  const num = (s: string) => parseFloat(s.replace(",", "."));

  function saveWeight() {
    const kg = num(weightInput);
    if (!Number.isFinite(kg) || kg <= 0) return;
    onSetBodyWeight(kg);
    setWeightInput("");
  }

  function addGoal(e: React.FormEvent) {
    e.preventDefault();
    const id = idByName.get(goalExercise.trim());
    const targetWeight = num(goalWeightInput);
    // A plain <input type="date"> value is "yyyy-mm-dd"; midnight local time
    // reads back naturally as "N weeks from now" without a timezone surprise.
    const targetDate = goalDateInput ? new Date(`${goalDateInput}T00:00:00`).getTime() : NaN;
    if (!id || !Number.isFinite(targetWeight) || targetWeight <= 0 || !Number.isFinite(targetDate)) {
      return;
    }
    onSetGoal(id, targetWeight, targetDate);
    setGoalExercise("");
    setGoalWeightInput("");
    setGoalDateInput("");
  }

  function toggleInjury(muscleId: string, mode: InjuryMode) {
    if (injuries[muscleId]?.mode === mode) onClearInjury(muscleId);
    else onSetInjury(muscleId, mode);
  }

  const weightPoints: Point[] = weighIns
    .slice()
    .sort((a, b) => a.at - b.at)
    .map((w) => ({ at: w.at, value: w.weight }));

  return (
    <>
      <button className="workout-scrim" aria-label={t("stats.close")} onClick={onClose} />
      <aside className="stats-panel" aria-label={t("stats.title")}>
        <div className="workout-head">
          <h2>{t("stats.title")}</h2>
          <button className="workout-close" onClick={onClose} aria-label={t("stats.close")}>
            ✕
          </button>
        </div>

        <section className="stats-section">
          <h3>{t("stats.bodyWeight")}</h3>
          <p className="stats-current">
            {profile?.bodyWeight ? `${profile.bodyWeight} ${u}` : t("stats.notSet")}
          </p>
          <form
            className="stats-edit"
            onSubmit={(e) => { e.preventDefault(); saveWeight(); }}
          >
            <input
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              inputMode="decimal"
              placeholder={profile?.bodyWeight ? String(profile.bodyWeight) : t("stats.bodyWeight")}
              aria-label={t("stats.bodyWeight")}
            />
            <button type="submit" className="stats-save">{t("stats.save")}</button>
          </form>
          <Trend points={weightPoints} unit={u} empty={t("stats.noHistory")} />
        </section>

        {LIFTS.map(({ id, key }) => {
          const derived = bestEstimate(setsById.get(id) ?? []);
          const derivedMax = derived ? roundLoad(derived.oneRM) : null;
          const override = knownMaxes[id];
          const effective = override?.max ?? derivedMax;
          const input = maxInputs[key] ?? "";

          const points: Point[] = (setsById.get(id) ?? [])
            .slice()
            .sort((a, b) => a.at - b.at)
            .map((s) => {
              const oneRM = bestEstimate([s]);
              return oneRM ? { at: s.at, value: roundLoad(oneRM.oneRM) } : null;
            })
            .filter((p): p is Point => p !== null);

          function save() {
            const max = num(input);
            if (!Number.isFinite(max) || max <= 0) return;
            onSetKnownMax(id, max, derivedMax);
            setMaxInputs((prev) => ({ ...prev, [key]: "" }));
          }

          return (
            <section className="stats-section" key={id}>
              <h3>{t(`stats.${key}`)}</h3>
              <p className="stats-current">
                {effective ? `${effective} ${u}` : t("stats.notSet")}
              </p>
              {/* Only when there is something to say about it — a max with no
                  override and no log is just unset, not a claim worth
                  explaining. */}
              {override && (
                <p className="plan-note flag">
                  {derivedMax
                    ? t("stats.overrideFrom", { from: derivedMax, unit: u })
                    : t("stats.overrideNoLog")}
                  {derivedMax && (
                    <button
                      className="tm-clear"
                      onClick={() => onClearKnownMax(id)}
                    >
                      {t("stats.revert", { max: derivedMax, unit: u })}
                    </button>
                  )}
                </p>
              )}
              <form
                className="stats-edit"
                onSubmit={(e) => { e.preventDefault(); save(); }}
              >
                <input
                  value={input}
                  onChange={(e) =>
                    setMaxInputs((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  inputMode="decimal"
                  placeholder={effective ? String(effective) : t(`stats.${key}`)}
                  aria-label={t(`stats.${key}`)}
                />
                <button type="submit" className="stats-save">{t("stats.save")}</button>
              </form>
              <Trend points={points} unit={u} empty={t("stats.noHistory")} />
            </section>
          );
        })}

        <section className="stats-section stats-goals">
          <h3>{t("stats.goals.title")}</h3>

          {Object.keys(goals).length === 0 ? (
            <p className="workout-empty">{t("stats.goals.empty")}</p>
          ) : (
            Object.entries(goals).map(([id, goal]) => {
              const raw = BY_ID.get(id);
              if (!raw) return null;
              const name = localizeExercise(raw).name;
              const increment = incrementFor(usesLegs(raw));
              const pace = goalPace(
                setsById.get(id) ?? [],
                trainingMaxes[id]?.tm,
                goal.targetWeight,
                goal.targetDate,
                increment,
              );
              const dateLabel = goalDateLabel(goal.targetDate);

              return (
                <div className="stats-goal" key={id}>
                  <p className="stats-goal-head">
                    <span className="stats-goal-name">
                      {name} — {goal.targetWeight} {u}
                    </span>
                    <span className="stats-goal-date">
                      {t("stats.goals.by", { date: dateLabel })}
                    </span>
                    <button className="tm-clear" onClick={() => onClearGoal(id)}>
                      {t("stats.goals.remove")}
                    </button>
                  </p>
                  <p className="plan-note">{goalPaceMessage(t, pace)}</p>
                </div>
              );
            })
          )}

          <form className="stats-edit stats-goal-form" onSubmit={addGoal}>
            <input
              className="stats-goal-exercise"
              list="stats-goal-exercises"
              value={goalExercise}
              onChange={(e) => setGoalExercise(e.target.value)}
              placeholder={t("stats.goals.exercise")}
              aria-label={t("stats.goals.exercise")}
            />
            <datalist id="stats-goal-exercises">
              {localizedExercises.map((x) => (
                <option key={x.id} value={x.name} />
              ))}
            </datalist>
            <input
              value={goalWeightInput}
              onChange={(e) => setGoalWeightInput(e.target.value)}
              inputMode="decimal"
              placeholder={t("stats.goals.weight")}
              aria-label={t("stats.goals.weight")}
            />
            <input
              type="date"
              value={goalDateInput}
              onChange={(e) => setGoalDateInput(e.target.value)}
              aria-label={t("stats.goals.date")}
            />
            <button type="submit" className="stats-save">{t("stats.goals.add")}</button>
          </form>
        </section>

        {/* Was its own panel, reached from a separate header button; folded in
            here since it's one more thing this app already knows about a
            body, same as a max or a target weight. "Avoid" keeps anything
            whose primary muscle is this one out of Train This, the rest-break
            partner list and the swap list. "Warn" leaves those lists exactly
            as they were, only flagged — chosen per muscle, not once for the
            whole feature, since a knee that rules out squats entirely is a
            different injury from a shoulder that just needs watching.
            Primary muscle only — see lib/injuries.ts's injuryFor(). */}
        <section className="stats-section">
          <h3>{t("injuryPanel.title")}</h3>
          <p className="plans-intro">{t("injuryPanel.intro")}</p>
          <ul className="injury-list">
            {MUSCLES.map((m) => {
              const current = injuries[m.key];
              const name = t(`muscles.${m.key}.name`, undefined, m.name);
              return (
                <li className="injury-row" key={m.key}>
                  <span className="injury-name">{name}</span>
                  <div className="chip-row">
                    <button
                      type="button"
                      className={`chip ${current?.mode === "avoid" ? "chip-selected" : ""}`}
                      aria-pressed={current?.mode === "avoid"}
                      onClick={() => toggleInjury(m.key, "avoid")}
                    >
                      {t("injuryPanel.avoid")}
                    </button>
                    <button
                      type="button"
                      className={`chip ${current?.mode === "warn" ? "chip-selected" : ""}`}
                      aria-pressed={current?.mode === "warn"}
                      onClick={() => toggleInjury(m.key, "warn")}
                    >
                      {t("injuryPanel.warn")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="plan-note">{t("injuryPanel.note")}</p>
        </section>
      </aside>
    </>
  );
}
