import { useMemo, useState } from "react";
import exercises from "../anatomy/exercises.json";
import muscleMap from "../anatomy/muscle-map.json";
import SetLogger from "./SetLogger";
import ProgressionPanel from "./ProgressionPanel";
import type { SetEntry } from "../state/useLog";
import { useI18n } from "../i18n/I18nProvider";

type Entry = {
  id: string;
  name: string;
  equipment?: string;
  instructions: string[];
  primary: string[];
  secondary: string[];
};

// Which region each muscle sits in, so a lift can be told apart as upper or
// lower body — 5/3/1 moves the two at different speeds, and this is how the
// increment is chosen without hard-coding four exercise names.
const REGION: Record<string, string> = Object.fromEntries(
  muscleMap.zones.filter((z) => z.key).map((z) => [z.key, z.region]),
);
const usesLegs = (x: Entry) =>
  [...x.primary, ...x.secondary].some((m) => REGION[m] === "Legs");

// Every exercise, one entry each — the same exercise is listed under every
// muscle it trains, and the workout stores ids, so this is the lookup back.
const BY_ID = new Map<string, Entry>();
for (const list of Object.values(exercises.muscles as Record<string, Entry[]>)) {
  for (const x of list) if (!BY_ID.has(x.id)) BY_ID.set(x.id, x);
}

type Props = {
  ids: string[];
  open: boolean;
  onClose: () => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: number) => void;
  onClear: () => void;
  today: Map<string, SetEntry[]>;
  best: Map<string, SetEntry>;
  onAddSet: (id: string, weight: number, reps: number) => void;
  onRemoveSet: (uid: string) => void;
  /** Every set ever recorded — the plan works from history, not just today. */
  allSets: SetEntry[];
  /** Body weight in the logging unit, or undefined if it isn't known. */
  bodyLoad?: number;
};

export default function WorkoutPanel({
  ids, open, onClose, onRemove, onMove, onClear,
  today, best, onAddSet, onRemoveSet, allSets, bodyLoad,
}: Props) {
  const { t, localizeExercise } = useI18n();
  const [planning, setPlanning] = useState<string | null>(null);

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

        {items.length === 0 ? (
          <p className="workout-empty">{t("workout.empty")}</p>
        ) : (
          <>
            <ol className="workout-list">
              {items.map((x, i) => (
                <li key={x.id}>
                  <div className="wrow">
                  <span className="wnum">{i + 1}</span>
                  <span className="wname">
                    {x.name}
                    {x.equipment && (
                      <em>{t(`equipment.${x.equipment}`, undefined, x.equipment)}</em>
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
                      onClick={() => onRemove(x.id)}
                      aria-label={`${t("workout.remove")} — ${x.name}`}
                    >
                      ✕
                    </button>
                  </span>
                  </div>
                  <SetLogger
                    exerciseId={x.id}
                    todaysSets={today.get(x.id) ?? []}
                    best={best.get(x.id)}
                    onAdd={onAddSet}
                    onRemove={onRemoveSet}
                    onPlan={() => setPlanning(x.id)}
                    bodyLoad={x.equipment === "body only" ? bodyLoad : undefined}
                  />
                </li>
              ))}
            </ol>
            <button className="workout-clear" onClick={onClear}>
              {t("workout.clear")}
            </button>
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
            onClose={() => setPlanning(null)}
          />
        );
      })()}
    </>
  );
}
