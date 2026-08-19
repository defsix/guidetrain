import muscleMap from "../anatomy/muscle-map.json";

/**
 * Which region each muscle sits in, so a lift can be told apart as upper or
 * lower body — 5/3/1 moves the two at different speeds, and this is how the
 * increment is chosen without hard-coding four exercise names.
 */
export const REGION: Record<string, string> = Object.fromEntries(
  muscleMap.zones.filter((z) => z.key).map((z) => [z.key, z.region]),
);

/** Whether an exercise trains the legs at all, primary or secondary. */
export function usesLegs(x: { primary: string[]; secondary: string[] }): boolean {
  return [...x.primary, ...x.secondary].some((m) => REGION[m] === "Legs");
}

/**
 * Every muscle a lift can name as its primary mover, one entry each — the
 * same set `exercises.json` is keyed by. Excludes zones like `foot`/`hand`/
 * `head` that the model can show but no exercise trains as a primary muscle
 * (`selectable: false`), so the injury picker doesn't offer a choice that
 * could never match anything.
 */
export const MUSCLES: { key: string; name: string; region: string }[] = muscleMap.zones
  .filter((z) => z.key && z.selectable !== false)
  .map((z) => ({ key: z.key, name: z.name, region: z.region }));
