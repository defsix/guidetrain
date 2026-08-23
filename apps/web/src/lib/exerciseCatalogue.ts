import exercisesData from "../anatomy/exercises.json";

export type CatalogueEntry = {
  id: string;
  name: string;
  equipment?: string;
  instructions: string[];
  primary: string[];
  secondary: string[];
  youtube?: string;
};

/**
 * Every exercise, one entry each.
 *
 * `exercises.json` lists an exercise once per muscle it trains, so the same
 * id appears repeatedly across the file's muscle groups; a `Map` keyed on id
 * is what collapses that back down to 180. Built once at module load — the
 * catalogue itself never changes, only how it's localized per render.
 */
export const ALL_EXERCISES: CatalogueEntry[] = (() => {
  const seen = new Map<string, CatalogueEntry>();
  for (const list of Object.values(exercisesData.muscles as Record<string, CatalogueEntry[]>)) {
    for (const x of list) if (!seen.has(x.id)) seen.set(x.id, x);
  }
  return [...seen.values()];
})();

export const BY_ID = new Map(ALL_EXERCISES.map((x) => [x.id, x]));
