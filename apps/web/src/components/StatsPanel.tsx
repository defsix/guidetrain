import { useMemo, useState } from "react";
import type { Profile } from "../types";
import type { SetEntry } from "../state/useLog";
import type { WeighIn } from "../state/useBodyWeightLog";
import type { KnownMaxEntry } from "../state/useKnownMax";
import type { TrainingMaxOverride } from "../state/useTrainingMax";
import type { Goal } from "../state/useGoals";
import type { Injury, InjuryMode } from "../state/useInjuries";
import type { Program } from "../state/usePrograms";
import { bestEstimate, roundLoad, incrementFor, goalPace } from "../lib/progression";
import { usesLegs, MUSCLES } from "../lib/muscleRegions";
import { goalPaceMessage, goalDateLabel } from "../lib/goalMessage";
import { ALL_EXERCISES, BY_ID } from "../lib/exerciseCatalogue";
import { type CustomExercise, toCatalogueEntry } from "../state/useCustomExercises";
import { buildTrainingExport } from "../lib/markdownExport";
import { downloadFile } from "../lib/download";
import { scrollIntoViewOnFocus } from "../lib/scrollIntoViewOnFocus";
import { useI18n } from "../i18n/I18nProvider";
import { useSwipeDismiss } from "../state/useSwipeDismiss";
import AutocompleteInput from "./AutocompleteInput";

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
  /** Every goal set for an exercise — more than one is allowed, each judged on its own. */
  goals: Record<string, Goal[]>;
  onSetGoal: (id: string, targetWeight: number, targetDate: number) => void;
  onClearGoal: (id: string, goalId: string) => void;
  injuries: Record<string, Injury>;
  onSetInjury: (muscleId: string, mode: InjuryMode) => void;
  onClearInjury: (muscleId: string) => void;
  /** Every saved workout, for the AI-ready export — see `lib/markdownExport.ts`. */
  programs: Program[];
  /** Exercises the reader typed in themselves — see useCustomExercises.ts. */
  customExercises: CustomExercise[];
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

/**
 * How many goals a reader can have open at once, across every exercise.
 *
 * Three, not unlimited — a goal is a thing to actually work towards, and a
 * list long enough to scroll past stops reading as that. Three is also
 * exactly enough to cover the lifts this panel already tracks a max for
 * (`LIFTS`, above), which is the shape most people reach for anyway.
 */
const MAX_GOALS = 3;

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
  injuries, onSetInjury, onClearInjury, programs, customExercises,
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

  // The catalogue plus whatever the reader has typed in themselves — same
  // lookup shape either way, so a goal can be set on a custom exercise the
  // same as any other.
  const byId = useMemo(() => {
    if (!customExercises.length) return BY_ID;
    const merged = new Map(BY_ID);
    for (const x of customExercises) merged.set(x.id, toCatalogueEntry(x));
    return merged;
  }, [customExercises]);

  // Localized once per language change rather than per keystroke in the
  // picker — the catalogue itself never changes, only its names do.
  const localizedExercises = useMemo(
    () => [...ALL_EXERCISES, ...customExercises.map(toCatalogueEntry)].map((x) => localizeExercise(x)),
    [localizeExercise, customExercises],
  );
  const idByName = useMemo(
    () => new Map(localizedExercises.map((x) => [x.name, x.id])),
    [localizedExercises],
  );

  const swipe = useSwipeDismiss(onClose);
  if (!open) return null;

  const u = t("unit.kg");
  const num = (s: string) => parseFloat(s.replace(",", "."));
  const goalCount = Object.values(goals).reduce((n, list) => n + list.length, 0);
  const atGoalLimit = goalCount >= MAX_GOALS;

  function saveWeight() {
    const kg = num(weightInput);
    if (!Number.isFinite(kg) || kg <= 0) return;
    onSetBodyWeight(kg);
    setWeightInput("");
  }

  function addGoal(e: React.FormEvent) {
    e.preventDefault();
    if (atGoalLimit) return;
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

  function exportMarkdown() {
    const md = buildTrainingExport({
      profile, allSets, knownMaxes, trainingMaxes, goals, injuries, programs, customExercises,
      t, localizeExercise,
    });
    const today = new Date().toISOString().slice(0, 10);
    downloadFile(`guidetrain-training-${today}.md`, md, "text/markdown;charset=utf-8;");
  }

  const weightPoints: Point[] = weighIns
    .slice()
    .sort((a, b) => a.at - b.at)
    .map((w) => ({ at: w.at, value: w.weight }));

  return (
    <>
      <button className="workout-scrim" aria-label={t("stats.close")} onClick={onClose} />
      <aside className="stats-panel" aria-label={t("stats.title")}>
        <div className={`workout-head ${swipe.dragging ? "dragging" : ""}`} {...swipe.handleProps}>
          <span className="sheet-handle" aria-hidden="true" />
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
              className="weight-input"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              onFocus={scrollIntoViewOnFocus}
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
                  className="weight-input"
                  value={input}
                  onChange={(e) =>
                    setMaxInputs((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  onFocus={scrollIntoViewOnFocus}
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
            Object.entries(goals).flatMap(([id, list]) => {
              const raw = byId.get(id);
              if (!raw) return [];
              const name = localizeExercise(raw).name;
              const increment = incrementFor(usesLegs(raw));

              return list.map((goal) => {
                const pace = goalPace(
                  setsById.get(id) ?? [],
                  trainingMaxes[id]?.tm,
                  goal.targetWeight,
                  goal.targetDate,
                  increment,
                );
                const dateLabel = goalDateLabel(goal.targetDate);

                return (
                  <div className="stats-goal" key={goal.id}>
                    <p className="stats-goal-head">
                      <span className="stats-goal-name">
                        {name} — {goal.targetWeight} {u}
                      </span>
                      <span className="stats-goal-date">
                        {t("stats.goals.by", { date: dateLabel })}
                      </span>
                      <button className="tm-clear" onClick={() => onClearGoal(id, goal.id)}>
                        {t("stats.goals.remove")}
                      </button>
                    </p>
                    <p className="plan-note">{goalPaceMessage(t, pace)}</p>
                  </div>
                );
              });
            })
          )}

          {/* Capped at MAX_GOALS, across every exercise, not per exercise —
              see the constant's own comment for why three. The form gives
              way to a plain sentence at the cap rather than a button that
              silently does nothing, matching how the list itself gives way
              to "no goals set yet" at zero. */}
          {atGoalLimit ? (
            <p className="workout-empty">{t("stats.goals.limit", { max: MAX_GOALS })}</p>
          ) : (
            // Three rows rather than one wrapped one: a lift's name needs
            // real width to search and read back, and squeezing it onto the
            // same line as a weight and a date left both of those cramped
            // too.
            <form className="stats-edit stats-goal-form" onSubmit={addGoal}>
              <AutocompleteInput
                className="stats-goal-exercise"
                options={localizedExercises.map((x) => x.name)}
                value={goalExercise}
                onChange={setGoalExercise}
                placeholder={t("stats.goals.exercise")}
                aria-label={t("stats.goals.exercise")}
              />
              <div className="stats-goal-row">
                <input
                  className="weight-input goal-weight-input"
                  value={goalWeightInput}
                  onChange={(e) => setGoalWeightInput(e.target.value)}
                  onFocus={scrollIntoViewOnFocus}
                  inputMode="decimal"
                  placeholder={t("stats.goals.weight")}
                  aria-label={t("stats.goals.weight")}
                />
                {/* A native date input's own placeholder is unreliable across
                    browsers/WebViews — some show a locale-formatted hint when
                    empty, some show nothing at all. This label says what the
                    field is for either way. */}
                <label className="stats-goal-date-input">
                  <span>{t("stats.goals.date")}</span>
                  <input
                    type="date"
                    value={goalDateInput}
                    onChange={(e) => setGoalDateInput(e.target.value)}
                    onFocus={scrollIntoViewOnFocus}
                  />
                </label>
              </div>
              <button type="submit" className="stats-save">{t("stats.goals.add")}</button>
            </form>
          )}
        </section>

        {/* Was its own panel, reached from a separate header button; folded in
            here since it's one more thing this app already knows about a
            body, same as a max or a target weight. "Avoid" keeps anything
            whose primary muscle is this one out of Train This, the rest-break
            partner list and the swap list. "Warn" leaves those lists exactly
            as they were, only flagged — chosen per muscle, not once for the
            whole feature, since a knee that rules out squats entirely is a
            different injury from a shoulder that just needs watching.
            Primary muscle only — see lib/injuries.ts's injuryFor(). A native
            <details> rather than a button-plus-state: 17 muscles is a wall of
            chips nobody wants sitting open by default under body weight and
            three lift maxes, and this needs no JS to stay keyboard- and
            screen-reader-accessible closed or open. */}
        <details className="stats-section stats-injuries">
          <summary>{t("injuryPanel.title")}</summary>
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
        </details>

        <section className="stats-section">
          <h3>{t("stats.export.title")}</h3>
          <p className="plans-intro">{t("stats.export.intro")}</p>
          <button type="button" className="stats-save" onClick={exportMarkdown}>
            {t("stats.export.button")}
          </button>
        </section>
      </aside>
    </>
  );
}
