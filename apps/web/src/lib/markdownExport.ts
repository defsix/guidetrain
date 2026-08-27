import type { Profile } from "../types";
import type { SetEntry } from "../state/useLog";
import type { KnownMaxEntry } from "../state/useKnownMax";
import type { TrainingMaxOverride } from "../state/useTrainingMax";
import type { Goal } from "../state/useGoals";
import type { Injury } from "../state/useInjuries";
import type { Program, Target } from "../state/usePrograms";
import type { TFn } from "../i18n";
import { bestEstimate, roundLoad, goalPace, incrementFor } from "./progression";
import { usesLegs, MUSCLES } from "./muscleRegions";
import { goalPaceMessage, goalDateLabel } from "./goalMessage";
import { positionLabel } from "./programLabel";
import { BY_ID, type CatalogueEntry } from "./exerciseCatalogue";
import { type CustomExercise, toCatalogueEntry } from "../state/useCustomExercises";

type Localize = <T extends { id: string; name: string; instructions: string[] }>(x: T) => T;

export type ExportInput = {
  profile: Profile | null;
  allSets: SetEntry[];
  knownMaxes: Record<string, KnownMaxEntry>;
  trainingMaxes: Record<string, TrainingMaxOverride>;
  goals: Record<string, Goal[]>;
  injuries: Record<string, Injury>;
  programs: Program[];
  /** Exercises the reader typed in themselves — see useCustomExercises.ts. */
  customExercises: CustomExercise[];
  t: TFn;
  localizeExercise: Localize;
};

function day(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function exerciseLabel(
  id: string,
  byId: Map<string, CatalogueEntry>,
  localizeExercise: Localize,
): { name: string; equipment?: string } {
  const raw = byId.get(id);
  // An exercise that has since left the catalogue still has sets or a goal
  // under it, and a blank line would lose them — same fallback HistoryPanel
  // uses for its CSV export.
  if (!raw) return { name: id.replace(/_/g, " ") };
  const localized = localizeExercise(raw);
  return { name: localized.name, equipment: raw.equipment };
}

function programLabel(p: Program, programs: Program[], t: TFn): string {
  if (p.name.trim()) return p.name.trim();
  return positionLabel(p, t, programs.indexOf(p) + 1);
}

function targetLine(target: Target | undefined): string {
  if (!target) return "no target set";
  if (target.steps && target.steps.length) {
    return target.steps
      .map((s) => (s.load ? `${s.reps}${s.amrap ? "+" : ""} @ ${s.load} kg` : `${s.reps}${s.amrap ? "+" : ""} reps`))
      .join(", ");
  }
  return `${target.sets} × ${target.reps}`;
}

/**
 * Everything the app knows about one person's training, as Markdown — meant
 * to be pasted whole into an AI chat, unlike the flat, sets-only CSV export
 * (`csvExport.ts`) that already exists for a spreadsheet. Structural headings
 * stay in English regardless of locale, the same call the CSV export already
 * makes for its column names: this is a data hand-off, not interface text,
 * and English reads reliably to a general-purpose AI regardless of who wrote
 * the training. Exercise names, program day labels and goal-pace verdicts go
 * through the app's existing localization instead of being hardcoded, since
 * those are the reader's own data, not export scaffolding.
 */
export function buildTrainingExport(input: ExportInput): string {
  const {
    profile, allSets, knownMaxes, trainingMaxes, goals, injuries, programs, customExercises,
    t, localizeExercise,
  } = input;
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  const byId = customExercises.length
    ? new Map<string, CatalogueEntry>([...BY_ID, ...customExercises.map((x) => [x.id, toCatalogueEntry(x)] as const)])
    : BY_ID;

  push("# GuideTrain training export");
  push();
  push(
    `Generated ${day(Date.now())}. Paste this into an AI chat for feedback on progress, ` +
      "planning or what to try next — everything below is what GuideTrain has recorded.",
  );
  push();

  push("## Profile");
  push();
  if (profile) {
    push(`- Age group: ${profile.ageGroup}`);
    push(
      `- Body weight: ${profile.bodyWeight ? `${profile.bodyWeight} kg` : "not recorded"}`,
    );
    const equipment = profile.equipment?.length
      ? profile.equipment.map((e) => t(`equipment.${e}`)).join(", ")
      : "not specified — every exercise is shown regardless of equipment";
    push(`- Equipment available: ${equipment}`);
  } else {
    push("- No profile set up yet.");
  }
  push();

  push("## Current program");
  push();
  if (programs.length === 0) {
    push("No workout set up yet.");
  } else {
    for (const p of programs) {
      push(`### ${programLabel(p, programs, t)}`);
      push();
      if (p.exerciseIds.length === 0) {
        push("- (empty)");
      } else {
        for (const id of p.exerciseIds) {
          const { name, equipment } = exerciseLabel(id, byId, localizeExercise);
          const target = p.targets?.[id];
          push(`- ${name}${equipment ? ` (${equipment})` : ""} — ${targetLine(target)}`);
        }
      }
      push();
    }
  }

  push("## Muscles to work around");
  push();
  const injuryEntries = Object.entries(injuries);
  if (injuryEntries.length === 0) {
    push("None marked.");
  } else {
    for (const [key, injury] of injuryEntries) {
      const muscle = MUSCLES.find((m) => m.key === key);
      const name = t(`muscles.${key}.name`, undefined, muscle?.name ?? key);
      const mode = t(injury.mode === "avoid" ? "injuryPanel.avoid" : "injuryPanel.warn");
      push(`- ${name}: ${mode} (marked ${day(injury.setAt)})`);
    }
  }
  push();

  push("## Training log and progress");
  push();
  const byExercise = new Map<string, SetEntry[]>();
  for (const s of allSets) {
    const list = byExercise.get(s.id);
    if (list) list.push(s);
    else byExercise.set(s.id, [s]);
  }
  const ids = new Set<string>([
    ...Object.keys(knownMaxes),
    ...Object.keys(trainingMaxes),
    ...Object.keys(goals),
    ...byExercise.keys(),
  ]);
  if (ids.size === 0) {
    push("No sets logged, maxes set or goals in place yet.");
  } else {
    const lastTrained = (id: string) => {
      const list = byExercise.get(id);
      return list && list.length ? Math.max(...list.map((s) => s.at)) : 0;
    };
    const sortedIds = [...ids].sort((a, b) => lastTrained(b) - lastTrained(a));

    for (const id of sortedIds) {
      const { name, equipment } = exerciseLabel(id, byId, localizeExercise);
      const sets = (byExercise.get(id) ?? []).slice().sort((a, b) => a.at - b.at);
      const best = bestEstimate(sets);
      const derivedMax = best ? roundLoad(best.oneRM) : null;
      const override = knownMaxes[id];
      const tm = trainingMaxes[id];
      const exGoals = goals[id] ?? [];

      push(`### ${name}${equipment ? ` (${equipment})` : ""}`);
      push();
      if (override) {
        push(`- Known max, typed in: ${override.max} kg`);
      } else if (derivedMax) {
        push(`- Estimated current max, from the log: ${derivedMax} kg`);
      }
      if (tm) push(`- 5/3/1 training max: ${tm.tm} kg`);

      for (const goal of exGoals) {
        const pace = goalPace(sets, tm?.tm, goal.targetWeight, goal.targetDate, incrementFor(usesLegs(byId.get(id) ?? { primary: [], secondary: [] })));
        push(
          `- Goal: ${goal.targetWeight} kg by ${goalDateLabel(goal.targetDate)} — ${goalPaceMessage(t, pace)}`,
        );
      }

      if (sets.length === 0) {
        push("- No sets logged yet.");
      } else {
        push(`- ${sets.length} set${sets.length === 1 ? "" : "s"} logged, ${day(sets[0].at)} to ${day(sets[sets.length - 1].at)}:`);
        for (const s of sets) {
          push(`  - ${day(s.at)}: ${s.weight} kg × ${s.reps}`);
        }
      }
      push();
    }
  }

  return lines.join("\n");
}

export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
