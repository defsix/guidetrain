import { useMemo, useState } from "react";
import exercises from "../anatomy/exercises.json";
import { swapsFor } from "../anatomy/pairs";
import SetLogger from "./SetLogger";
import ProgressionPanel from "./ProgressionPanel";
import SwapPanel from "./SwapPanel";
import TargetPips from "./TargetPips";
import type { SetEntry } from "../state/useLog";
import type { Program, Target } from "../state/usePrograms";
import type { TrainingMaxOverride } from "../state/useTrainingMax";
import type { Goal } from "../state/useGoals";
import { useRestTimer } from "../state/useRestTimer";
import { restSeconds, REST_EXTEND_SECONDS } from "../lib/progression";
import { usesLegs } from "../lib/muscleRegions";
import { injuryFor, isAvoided } from "../lib/injuries";
import { injuryTag, injuryNote } from "../lib/injuryMessage";
import type { Injury } from "../state/useInjuries";
import { useI18n } from "../i18n/I18nProvider";

type Entry = {
  id: string;
  name: string;
  equipment?: string;
  instructions: string[];
  primary: string[];
  secondary: string[];
};

// Every exercise, one entry each — the same exercise is listed under every
// muscle it trains, and the workout stores ids, so this is the lookup back.
const BY_ID = new Map<string, Entry>();
for (const list of Object.values(exercises.muscles as Record<string, Entry[]>)) {
  for (const x of list) if (!BY_ID.has(x.id)) BY_ID.set(x.id, x);
}

type Props = {
  ids: string[];
  programs: Program[];
  active: Program | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onRemoveProgram: (id: string) => void;
  open: boolean;
  onClose: () => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: number) => void;
  onClear: () => void;
  today: Map<string, SetEntry[]>;
  best: Map<string, SetEntry>;
  onAddSet: (id: string, weight: number, reps: number) => void;
  onRemoveSet: (uid: string) => void;
  targets: Record<string, Target>;
  onTarget: (id: string, t: Target | null) => void;
  onBrowsePlans: () => void;
  /** Every set ever recorded — the plan works from history, not just today. */
  allSets: SetEntry[];
  /** Body weight in the logging unit, or undefined if it isn't known. */
  bodyLoad?: number;
  /** Sets skipped today, per exercise. Never part of the log. */
  skips: Record<string, number>;
  onSkip: (id: string, n?: number) => void;
  onUnskip: (id: string) => void;
  /** Training maxes set by hand, which beat the ones derived from the log. */
  trainingMaxes: Record<string, TrainingMaxOverride>;
  onSetTrainingMax: (id: string, tm: number, from: number) => void;
  onClearTrainingMax: (id: string) => void;
  onSwap: (oldId: string, newId: string) => void;
  /** Equipment the reader said they have — sharpens swap ranking, same as it does for pairs. */
  equipmentAvailable?: string[];
  /** Goals set on the Stats page, per exercise id — shown in Plan → for that exercise. */
  goals: Record<string, Goal>;
  /** Injuries marked on the Stats page, per muscle id — narrows the swap list and flags matching rows. */
  injuries: Record<string, Injury>;
};

/**
 * What to call a workout: what the reader typed, else the key the app gave it,
 * else its position. All three resolve at render, so none of them freeze a
 * language into storage.
 */
function label(p: Program, programs: Program[], t: (k: string, v?: any) => string) {
  if (p.name.trim()) return p.name.trim();
  if (p.nameKey) return t(p.nameKey);
  return t("program.untitled", { n: programs.indexOf(p) + 1 });
}

export default function WorkoutPanel({
  ids, programs, active, onSelect, onCreate, onRename, onRemoveProgram,
  open, onClose, onRemove, onMove, onClear,
  today, best, onAddSet, onRemoveSet, allSets, bodyLoad, targets, onTarget,
  onBrowsePlans, skips, onSkip, onUnskip,
  trainingMaxes, onSetTrainingMax, onClearTrainingMax,
  onSwap, equipmentAvailable, goals, injuries,
}: Props) {
  const { t, localizeExercise } = useI18n();
  const [planning, setPlanning] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const restTimer = useRestTimer();

  const equipmentSet = useMemo(
    () => (equipmentAvailable && equipmentAvailable.length ? new Set(equipmentAvailable) : null),
    [equipmentAvailable],
  );

  // Computed only while the panel is open, from the exercise being replaced
  // rather than from `items` — the localized copy items holds has already
  // dropped the primary/secondary muscle data swapsFor needs.
  const swapAnchor = swapping ? BY_ID.get(swapping) : null;
  const swapCandidates = useMemo(() => {
    if (!swapAnchor) return [];
    // A wider pool than the 4 actually shown, so an "avoid" injury filtering
    // some out doesn't just shrink the list below what swapsFor would
    // otherwise have offered.
    return swapsFor(swapAnchor, 12, equipmentSet)
      .filter((x) => !isAvoided(x, injuries))
      .slice(0, 4)
      .map(localizeExercise);
  }, [swapAnchor, equipmentSet, injuries, localizeExercise]);

  /** Sets dealt with today: logged plus skipped. */
  const dealtWith = (id: string) => (today.get(id) ?? []).length + (skips[id] ?? 0);

  /**
   * The workout after this one, if the reader has one.
   *
   * Position in the list, which is the order the days of a plan were added in,
   * so finishing Workout A offers Workout B. Nothing cycles back to the start:
   * reaching the end of the week is worth noticing, and a list that quietly
   * wraps would hide it.
   */
  const nextProgram = useMemo(() => {
    if (!active) return null;
    const i = programs.indexOf(active);
    return i >= 0 && i + 1 < programs.length ? programs[i + 1] : null;
  }, [active, programs]);

  // Looked up and translated at render, not at save: a workout saved in English
  // and opened in Polish should be in Polish, and an exercise whose text was
  // corrected should show the correction.
  const items = useMemo(
    () =>
      ids
        .map((id) => BY_ID.get(id))
        .filter((x): x is Entry => Boolean(x))
        .map((x) => localizeExercise(x)),
    [ids, localizeExercise],
  );

  if (!open) return null;

  return (
    <>
      <button className="workout-scrim" aria-label={t("workout.close")} onClick={onClose} />
      <aside className="workout-panel" aria-label={t("workout.title")}>
        <div className="workout-head">
          <h2>{t("workout.title")}</h2>
          <button className="workout-close" onClick={onClose} aria-label={t("workout.close")}>
            ✕
          </button>
        </div>

        {/* One row of programs. Tabs rather than a dropdown: with a handful of
            workouts they are all worth seeing at once, and switching between
            two of them is the common move. */}
        <div className="program-tabs" role="tablist" aria-label={t("program.tabs")}>
          {programs.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={active?.id === p.id}
              className={`program-tab ${active?.id === p.id ? "on" : ""}`}
              onClick={() => { onSelect(p.id); setRenaming(false); }}
            >
              {label(p, programs, t)}
              <span className="pcount">{p.exerciseIds.length}</span>
            </button>
          ))}
          <button className="program-add" onClick={onCreate} aria-label={t("program.add")}>
            +
          </button>
        </div>

        {active && (
          <div className="program-bar">
            {renaming ? (
              <form
                className="program-rename"
                onSubmit={(e) => {
                  e.preventDefault();
                  onRename(active.id, draft.trim());
                  setRenaming(false);
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={label(active, programs, t)}
                  aria-label={t("program.name")}
                  maxLength={40}
                  autoFocus
                />
                <button type="submit">{t("program.save")}</button>
              </form>
            ) : (
              <>
                <button
                  className="program-action"
                  onClick={() => { setDraft(active.name); setRenaming(true); }}
                >
                  {t("program.rename")}
                </button>
                {/* Deleting takes the exercises with it, so it is only offered
                    once there is a second program to fall back to. */}
                {programs.length > 1 && (
                  <button
                    className="program-action"
                    onClick={() => onRemoveProgram(active.id)}
                  >
                    {t("program.delete")}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <>
            <p className="workout-empty">{t("workout.empty")}</p>
            {/* The other way in, for anyone who would rather be handed a
                workout than assemble one. */}
            <button className="plans-open" onClick={onBrowsePlans}>
              {t("plans.browse")}
            </button>
          </>
        ) : (
          <>
            {(() => {
              // Only worth saying once something has a target; before that the
              // honest count is zero of zero, which is noise.
              const withTarget = items.filter((x) => targets[x.id]);
              if (!withTarget.length) return null;
              const done = withTarget.filter((x) => dealtWith(x.id) >= targets[x.id].sets).length;
              const complete = done === withTarget.length;
              return (
                <>
                  <p className={`workout-progress ${complete ? "done" : ""}`}>
                    {t("target.overall", { done, count: withTarget.length })}
                  </p>
                  {/* Finishing a workout is the one moment the app knows what
                      you probably want next, so it says so rather than leaving
                      you to find the tab. Only when there is a next one: at the
                      end of the week the right message is that you finished. */}
                  {complete && (
                    <div className="workout-next">
                      {nextProgram ? (
                        <>
                          <p>{t("workout.finished")}</p>
                          <button
                            className="primary-button"
                            onClick={() => { onSelect(nextProgram.id); setRenaming(false); }}
                          >
                            {t("workout.goNext", {
                              name: label(nextProgram, programs, t),
                            })}
                          </button>
                        </>
                      ) : (
                        <p>{t("workout.finishedLast")}</p>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
            <ol className="workout-list">
              {items.map((x, i) => {
                const injury = injuryFor(x, injuries);
                const injuredMuscleName = injury
                  ? t(`muscles.${injury.muscle}.name`, undefined, injury.muscle)
                  : "";
                return (
                <li key={x.id}>
                  <div className="wrow">
                  <span className="wnum">{i + 1}</span>
                  <span className="wname">
                    {x.name}
                    {x.equipment && (
                      <em>{t(`equipment.${x.equipment}`, undefined, x.equipment)}</em>
                    )}
                    {injury && (
                      <em className={`injury-flag injury-flag-${injury.mode}`} title={injuryNote(t, injury.mode, injuredMuscleName)}>
                        {injuryTag(t, injury.mode)}
                      </em>
                    )}
                  </span>
                  {/* Buttons rather than drag: a drag target is hard to hit on a
                      phone, impossible from a keyboard, and this list is short
                      enough that two taps beat a gesture. Disabled at the ends
                      instead of wrapping, since a wrap looks like a bug. */}
                  <span className="wmove">
                    <button
                      onClick={() => onMove(x.id, -1)}
                      disabled={i === 0}
                      aria-label={`${t("workout.moveUp")} — ${x.name}`}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => onMove(x.id, 1)}
                      disabled={i === items.length - 1}
                      aria-label={`${t("workout.moveDown")} — ${x.name}`}
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => setSwapping(x.id)}
                      aria-label={`${t("swap.button")} — ${x.name}`}
                      title={t("swap.button")}
                    >
                      ⇄
                    </button>
                    <button
                      onClick={() => onRemove(x.id)}
                      aria-label={`${t("workout.remove")} — ${x.name}`}
                    >
                      ✕
                    </button>
                  </span>
                    <TargetPips
                      target={targets[x.id]}
                      done={(today.get(x.id) ?? []).length}
                      skipped={skips[x.id] ?? 0}
                      onChange={(target) => onTarget(x.id, target)}
                    />
                  </div>
                  <SetLogger
                    exerciseId={x.id}
                    todaysSets={today.get(x.id) ?? []}
                    best={best.get(x.id)}
                    onAdd={(id, weight, reps) => {
                      onAddSet(id, weight, reps);
                      restTimer.start(id, restSeconds(reps));
                    }}
                    onRemove={onRemoveSet}
                    onPlan={() => setPlanning(x.id)}
                    bodyLoad={x.equipment === "body only" ? bodyLoad : undefined}
                    target={targets[x.id]}
                    instructions={x.instructions}
                    equipment={x.equipment}
                    skipped={skips[x.id] ?? 0}
                    onSkipSet={targets[x.id] ? () => onSkip(x.id) : undefined}
                    onSkipRest={
                      targets[x.id]
                        ? () => onSkip(x.id, targets[x.id].sets - dealtWith(x.id))
                        : undefined
                    }
                    onUnskip={() => onUnskip(x.id)}
                    restTimer={
                      restTimer.exerciseId === x.id
                        ? { remaining: restTimer.remaining, total: restTimer.total }
                        : null
                    }
                    onRestTimerSkip={restTimer.exerciseId === x.id ? restTimer.clear : undefined}
                    onRestTimerExtend={
                      restTimer.exerciseId === x.id
                        ? () => restTimer.extend(REST_EXTEND_SECONDS)
                        : undefined
                    }
                  />
                </li>
                );
              })}
            </ol>
            <div className="workout-foot">
              <button className="plans-open" onClick={onBrowsePlans}>
                {t("plans.browse")}
              </button>
              <button className="workout-clear" onClick={onClear}>
                {t("workout.clear")}
              </button>
            </div>
          </>
        )}
      </aside>
      {planning && (() => {
        const x = items.find((i) => i.id === planning);
        const raw = BY_ID.get(planning);
        if (!x || !raw) return null;
        return (
          <ProgressionPanel
            name={x.name}
            sets={allSets.filter((s) => s.id === planning)}
            usesLegs={usesLegs(raw)}
            barbell={raw.equipment === "barbell"}
            repsOnly={raw.equipment === "body only"}
            workoutTarget={targets[planning]}
            onUseWeek={(target) => onTarget(planning, target)}
            override={trainingMaxes[planning]}
            onSetTrainingMax={(tm, from) => onSetTrainingMax(planning, tm, from)}
            onClearTrainingMax={() => onClearTrainingMax(planning)}
            onClose={() => setPlanning(null)}
            goal={goals[planning]}
          />
        );
      })()}
      <SwapPanel
        exercise={items.find((i) => i.id === swapping) ?? null}
        candidates={swapCandidates}
        injuries={injuries}
        onPick={(newId) => {
          if (swapping) onSwap(swapping, newId);
          setSwapping(null);
        }}
        onClose={() => setSwapping(null)}
      />
    </>
  );
}
