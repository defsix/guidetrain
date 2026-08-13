import { useMemo } from "react";
import exercises from "../anatomy/exercises.json";
import SetLogger from "./SetLogger";
import type { SetEntry, Unit } from "../state/useLog";
import { useI18n } from "../i18n/I18nProvider";

type Entry = {
  id: string;
  name: string;
  equipment?: string;
  instructions: string[];
};

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
  unit: Unit;
  onUnit: (u: Unit) => void;
  today: Map<string, SetEntry[]>;
  best: Map<string, SetEntry>;
  onAddSet: (id: string, weight: number, reps: number) => void;
  onRemoveSet: (uid: string) => void;
};

export default function WorkoutPanel({
  ids, open, onClose, onRemove, onMove, onClear,
  unit, onUnit, today, best, onAddSet, onRemoveSet,
}: Props) {
  const { t, localizeExercise } = useI18n();

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
          <div className="workout-head-right">
            {/* Which unit new sets are recorded in. Entries already written
                keep the unit they were written in, so this changes what
                happens next and never what already happened. */}
            <div className="unit-switch" role="group" aria-label={t("log.unit")}>
              {(["kg", "lb"] as Unit[]).map((u) => (
                <button
                  key={u}
                  className={unit === u ? "on" : ""}
                  aria-pressed={unit === u}
                  onClick={() => onUnit(u)}
                >
                  {t(`unit.${u}`, undefined, u)}
                </button>
              ))}
            </div>
            <button className="workout-close" onClick={onClose} aria-label={t("workout.close")}>
              ✕
            </button>
          </div>
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
                    unit={unit}
                    todaysSets={today.get(x.id) ?? []}
                    best={best.get(x.id)}
                    onAdd={onAddSet}
                    onRemove={onRemoveSet}
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
    </>
  );
}
