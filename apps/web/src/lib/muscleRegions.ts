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
