import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider";

type Target = { sets: number; reps: number };

type Props = {
  target?: Target;
  /** How many sets were logged for this exercise today. */
  done: number;
  onChange: (t: Target | null) => void;
};

/**
 * The target for one exercise, and how far through it you are.
 *
 * The pips fill from the log. Nothing here is tappable-to-tick on purpose: a
 * tick you set yourself would be a second account of the same session, free to
 * disagree with the sets you recorded, and then one of the two is wrong and the
 * app cannot say which. Logging a set is the tick.
 *
 * Overshooting is shown rather than clamped — a fourth set on a target of three
 * is a thing that happened, and hiding it would make the log and the pips
 * disagree, which is the failure this design exists to avoid.
 */
export default function TargetPips({ target, done, onChange }: Props) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [sets, setSets] = useState(String(target?.sets ?? 3));
  const [reps, setReps] = useState(String(target?.reps ?? 5));

  function save(e: React.FormEvent) {
    e.preventDefault();
    const s = Math.round(Number(sets));
    const r = Math.round(Number(reps));
    if (s > 0 && s <= 20 && r > 0 && r <= 100) onChange({ sets: s, reps: r });
    setEditing(false);
  }

  if (editing) {
    return (
      <form className="target-edit" onSubmit={save}>
        <input
          value={sets}
          onChange={(e) => setSets(e.target.value)}
          inputMode="numeric"
          maxLength={2}
          aria-label={t("target.sets")}
        />
        <span className="by">×</span>
        <input
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          inputMode="numeric"
          maxLength={3}
          aria-label={t("target.reps")}
        />
        <button type="submit">{t("target.save")}</button>
        {target && (
          <button type="button" className="target-clear" onClick={() => { onChange(null); setEditing(false); }}>
            {t("target.clear")}
          </button>
        )}
      </form>
    );
  }

  if (!target) {
    return (
      <button className="target-add" onClick={() => setEditing(true)}>
        {t("target.add")}
      </button>
    );
  }

  const complete = done >= target.sets;
  return (
    <div className={`target ${complete ? "done" : ""}`}>
      <button
        className="target-label"
        onClick={() => setEditing(true)}
        aria-label={t("target.edit", { sets: target.sets, reps: target.reps })}
      >
        {target.sets} × {target.reps}
      </button>
      <span
        className="pips"
        role="img"
        aria-label={t("target.progress", { done, count: target.sets })}
      >
        {Array.from({ length: target.sets }, (_, i) => (
          <span key={i} className={`pip ${i < done ? "on" : ""}`} />
        ))}
        {/* Anything past the target still shows. It happened. */}
        {done > target.sets &&
          Array.from({ length: done - target.sets }, (_, i) => (
            <span key={`x${i}`} className="pip extra" />
          ))}
      </span>
    </div>
  );
}
