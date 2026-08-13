import { useMemo, useState } from "react";
import exercises from "../anatomy/exercises.json";
import type { SetEntry } from "../state/useLog";
import { estimateOneRepMax, roundLoad } from "../lib/progression";
import { useI18n } from "../i18n/I18nProvider";

type Entry = { id: string; name: string; equipment?: string; instructions: string[] };

const BY_ID = new Map<string, Entry>();
for (const list of Object.values(exercises.muscles as Record<string, Entry[]>)) {
  for (const x of list) if (!BY_ID.has(x.id)) BY_ID.set(x.id, x);
}

type Props = {
  open: boolean;
  onClose: () => void;
  sets: SetEntry[];
};

/** A local calendar day, which is what "a session" means to the person doing it. */
function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
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
export default function HistoryPanel({ open, onClose, sets }: Props) {
  const { t, localizeExercise } = useI18n();
  const [byExercise, setByExercise] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

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
  if (!open) return null;

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
        <div className="workout-head">
          <h2>{t("history.title")}</h2>
          <button className="workout-close" onClick={onClose} aria-label={t("history.close")}>
            ✕
          </button>
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
                  <span className="hload">
                    {s.weight} {u} × {s.reps}
                  </span>
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
                          of the same lift are one thing you did, not three. */}
                      {[...new Set(d.sets.map((s) => s.id))].map((id) => (
                        <li key={id}>
                          <span className="hname">{name(id)}</span>
                          <span className="hsets">
                            {d.sets
                              .filter((s) => s.id === id)
                              .map((s, i) => (
                                <span key={i}>
                                  {s.weight} {u} × {s.reps}
                                </span>
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
