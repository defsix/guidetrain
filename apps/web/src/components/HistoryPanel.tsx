import { useMemo, useState } from "react";
import exercises from "../anatomy/exercises.json";
import type { SetEntry } from "../state/useLog";
import { estimateOneRepMax, roundLoad } from "../lib/progression";
import { setsToCsv, downloadCsv } from "../lib/csvExport";
import { useI18n } from "../i18n/I18nProvider";
import type { TFn } from "../i18n";
import { useSwipeDismiss } from "../state/useSwipeDismiss";

type Entry = { id: string; name: string; equipment?: string; instructions: string[] };

const BY_ID = new Map<string, Entry>();
for (const list of Object.values(exercises.muscles as Record<string, Entry[]>)) {
  for (const x of list) if (!BY_ID.has(x.id)) BY_ID.set(x.id, x);
}

type Props = {
  open: boolean;
  onClose: () => void;
  sets: SetEntry[];
  /** A mistyped weight or rep count, corrected in place — see useLog.ts's edit(). */
  onEditSet: (uid: string, weight: number, reps: number) => void;
  onRemoveSet: (uid: string) => void;
};

/** A local calendar day, which is what "a session" means to the person doing it. */
function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

type RowProps = {
  s: SetEntry;
  unit: string;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (weight: number, reps: number) => void;
  onRemove: () => void;
  t: TFn;
};

/**
 * One logged set: a plain weight × reps with edit/delete controls, or — while
 * `editing` — the form those controls open. Shared between the by-day and
 * by-exercise views rather than written twice, since a set here is the same
 * thing in either.
 */
function SetRow({ s, unit, editing, onStartEdit, onCancelEdit, onSaveEdit, onRemove, t }: RowProps) {
  const [weight, setWeight] = useState(String(s.weight));
  const [reps, setReps] = useState(String(s.reps));

  if (editing) {
    return (
      <form
        className="hist-edit-form"
        onSubmit={(e) => {
          e.preventDefault();
          const w = parseFloat(weight.replace(",", "."));
          const r = parseInt(reps, 10);
          if (Number.isFinite(w) && w >= 0 && Number.isFinite(r) && r > 0) onSaveEdit(w, r);
        }}
      >
        <input
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          inputMode="decimal"
          aria-label={t("log.weight")}
          className="hist-edit-input"
        />
        <span className="cap">{unit}</span>
        <input
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          inputMode="numeric"
          aria-label={t("log.reps")}
          className="hist-edit-input"
        />
        <button type="submit" className="hist-edit-save">
          {t("history.save")}
        </button>
        <button type="button" className="hist-edit-cancel" onClick={onCancelEdit}>
          {t("account.cancel")}
        </button>
      </form>
    );
  }

  return (
    <span className="hist-set-row">
      <span className="hload">
        {s.weight} {unit} × {s.reps}
      </span>
      <span className="hist-set-actions">
        <button
          type="button"
          className="hist-set-action"
          onClick={onStartEdit}
          aria-label={t("history.editSet")}
        >
          {t("history.editSet")}
        </button>
        <button
          type="button"
          className="hist-set-action hist-set-remove"
          onClick={onRemove}
          aria-label={t("history.deleteSet")}
        >
          {t("history.deleteSet")}
        </button>
      </span>
    </span>
  );
}

/**
 * What you have actually done.
 *
 * Every set has been stored since logging shipped and none of it was ever
 * shown: the log fed the estimator and the prescriber and was otherwise
 * write-only. That is a strange thing to ask of someone — record every set
 * forever, see none of it — and it is the screen this app most obviously
 * lacked.
 *
 * Two ways in, because there are two questions. By day answers "what did I do
 * on Tuesday", which is how you check whether you actually trained. By
 * exercise answers "is my squat going anywhere", which is the one people
 * really want and which no single session can show.
 *
 * On the device, like everything else here. Nothing in this file needs a
 * server; accounts would make it survive a lost phone, not make it possible.
 */
export default function HistoryPanel({ open, onClose, sets, onEditSet, onRemoveSet }: Props) {
  const { t, localizeExercise } = useI18n();
  const [byExercise, setByExercise] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [editingUid, setEditingUid] = useState<string | null>(null);

  const name = useMemo(() => {
    return (id: string) => {
      const raw = BY_ID.get(id);
      // An exercise that has left the catalogue still has sets under it, and a
      // blank row would lose them. The id is ugly but it is not nothing.
      return raw ? localizeExercise(raw).name : id.replace(/_/g, " ");
    };
  }, [localizeExercise]);

  /** Sessions, newest first, each with its sets in the order they were done. */
  const days = useMemo(() => {
    const m = new Map<string, SetEntry[]>();
    for (const s of sets) {
      const k = dayKey(s.at);
      const list = m.get(k);
      if (list) list.push(s);
      else m.set(k, [s]);
    }
    return [...m.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, list]) => ({
        key,
        at: list[0].at,
        sets: [...list].sort((a, b) => a.at - b.at),
      }));
  }, [sets]);

  /** Every exercise trained, with enough to say whether it is going anywhere. */
  const lifts = useMemo(() => {
    const m = new Map<string, SetEntry[]>();
    for (const s of sets) {
      const list = m.get(s.id);
      if (list) list.push(s);
      else m.set(s.id, [s]);
    }
    return [...m.entries()]
      .map(([id, list]) => {
        let best: { oneRM: number; set: SetEntry } | null = null;
        for (const s of list) {
          const oneRM = estimateOneRepMax(s.weight, s.reps);
          if (oneRM !== null && (!best || oneRM > best.oneRM)) best = { oneRM, set: s };
        }
        return {
          id,
          sets: [...list].sort((a, b) => b.at - a.at),
          last: Math.max(...list.map((s) => s.at)),
          best,
        };
      })
      .sort((a, b) => b.last - a.last);
  }, [sets]);

  const u = t("unit.kg");
  const swipe = useSwipeDismiss(onClose);
  if (!open) return null;

  function exportCsv() {
    const csv = setsToCsv(sets, name);
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`guidetrain-history-${today}.csv`, csv);
  }

  function saveEdit(uid: string, weight: number, reps: number) {
    onEditSet(uid, weight, reps);
    setEditingUid(null);
  }

  function removeSet(uid: string) {
    onRemoveSet(uid);
    if (editingUid === uid) setEditingUid(null);
  }

  const fmtDate = (at: number) =>
    new Date(at).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const detail = chosen ? lifts.find((l) => l.id === chosen) : null;

  return (
    <>
      <button className="workout-scrim" aria-label={t("history.close")} onClick={onClose} />
      <aside className="history-panel" aria-label={t("history.title")}>
        <div className={`workout-head ${swipe.dragging ? "dragging" : ""}`} {...swipe.handleProps}>
          <span className="sheet-handle" aria-hidden="true" />
          <h2>{t("history.title")}</h2>
          <div className="workout-head-actions">
            {sets.length > 0 && (
              <button className="history-export" onClick={exportCsv}>
                {t("history.export")}
              </button>
            )}
            <button className="workout-close" onClick={onClose} aria-label={t("history.close")}>
              ✕
            </button>
          </div>
        </div>

        {sets.length === 0 ? (
          <p className="workout-empty">{t("history.empty")}</p>
        ) : detail ? (
          <>
            <button className="plans-back" onClick={() => setChosen(null)}>
              ‹ {t("history.back")}
            </button>
            <p className="plan-name">{name(detail.id)}</p>
            {detail.best && (
              <p className="plan-note">
                {t("history.bestEver", {
                  max: roundLoad(detail.best.oneRM),
                  unit: u,
                  weight: detail.best.set.weight,
                  reps: detail.best.set.reps,
                })}
              </p>
            )}
            <ul className="hist-sets">
              {detail.sets.map((s) => (
                <li key={s.uid}>
                  <span className="hdate">{fmtDate(s.at)}</span>
                  <SetRow
                    s={s}
                    unit={u}
                    editing={editingUid === s.uid}
                    onStartEdit={() => setEditingUid(s.uid)}
                    onCancelEdit={() => setEditingUid(null)}
                    onSaveEdit={(w, r) => saveEdit(s.uid, w, r)}
                    onRemove={() => removeSet(s.uid)}
                    t={t}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className="hist-tabs" role="tablist" aria-label={t("history.title")}>
              <button
                role="tab"
                aria-selected={!byExercise}
                className={`program-tab ${!byExercise ? "on" : ""}`}
                onClick={() => setByExercise(false)}
              >
                {t("history.byDay")}
              </button>
              <button
                role="tab"
                aria-selected={byExercise}
                className={`program-tab ${byExercise ? "on" : ""}`}
                onClick={() => setByExercise(true)}
              >
                {t("history.byExercise")}
              </button>
            </div>

            <p className="hist-count">
              {t("history.total", { count: sets.length })} · {t("history.sessions", { count: days.length })}
            </p>

            {byExercise ? (
              <ul className="hist-lifts">
                {lifts.map((l) => (
                  <li key={l.id}>
                    <button onClick={() => setChosen(l.id)}>
                      <span className="hname">{name(l.id)}</span>
                      <span className="hmeta">
                        {t("history.setsLogged", { count: l.sets.length })}
                        {l.best && ` · ${t("history.best", {
                          weight: l.best.set.weight,
                          unit: u,
                          reps: l.best.set.reps,
                        })}`}
                      </span>
                      <span className="hwhen">{fmtDate(l.last)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="hist-days">
                {days.map((d) => (
                  <div className="hist-day" key={d.key}>
                    <h3>{fmtDate(d.at)}</h3>
                    <ul>
                      {/* Grouped by exercise within the day, since three sets
                          of the same lift are one thing you did, not three —
                          but each set inside that group is still its own row,
                          since editing or deleting one must not touch the
                          others. */}
                      {[...new Set(d.sets.map((s) => s.id))].map((id) => (
                        <li key={id}>
                          <span className="hname">{name(id)}</span>
                          <span className="hsets">
                            {d.sets
                              .filter((s) => s.id === id)
                              .map((s) => (
                                <SetRow
                                  key={s.uid}
                                  s={s}
                                  unit={u}
                                  editing={editingUid === s.uid}
                                  onStartEdit={() => setEditingUid(s.uid)}
                                  onCancelEdit={() => setEditingUid(null)}
                                  onSaveEdit={(w, r) => saveEdit(s.uid, w, r)}
                                  onRemove={() => removeSet(s.uid)}
                                  t={t}
                                />
                              ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </aside>
    </>
  );
}
