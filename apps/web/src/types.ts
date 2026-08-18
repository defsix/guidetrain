export type AgeGroup = "teen" | "18-29" | "30-44" | "45-59" | "60+";

/**
 * Equipment worth asking about — one physical thing a person either has
 * access to or doesn't. "body only" isn't here because it needs no answer:
 * everyone always has it. "other" isn't either — the catalogue's own
 * grab-bag for sleds, wrist rollers, suspension trainers and the like, no
 * two of which are the same purchase, so a single checkbox for it would
 * claim access to gear a "yes" was never actually about.
 */
export const EQUIPMENT_TAGS = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "kettlebells",
  "bands",
  "exercise ball",
] as const;
export type EquipmentTag = (typeof EQUIPMENT_TAGS)[number];

export interface Profile {
  username: string;
  ageGroup: AgeGroup;
  /**
   * Body weight in kilos, to the nearest whole one. An exact figure rather than
   * a band, because unlike age it is arithmetic input: it is the load on every
   * push-up and chin-up in the catalogue, and a band could not be added to a
   * bar.
   *
   * Optional in the type because a profile saved before this field existed is
   * still a valid profile and must not be read as zero.
   */
  bodyWeight?: number;
  /** Only ever "kg" now; kept so a profile saved in pounds can be spotted. */
  bodyWeightUnit?: "kg" | "lb";
  /**
   * What's actually available right now, not a permanent fact about the
   * person — the whole point is that this changes when a gym-goer trains at
   * home instead. Undefined or empty means no preference stated, which shows
   * every exercise in catalogue order exactly as it always has: this feature
   * is additive, and nobody who never opens the equipment panel should see
   * anything reordered.
   */
  equipment?: EquipmentTag[];
}

