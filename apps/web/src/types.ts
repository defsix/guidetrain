export type AgeGroup = "teen" | "18-29" | "30-44" | "45-59" | "60+";

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
}

export interface MuscleGroup {
  id: string;
  slug: string;
  name: string;
  latinName: string;
  description: string;
  sortOrder: number;
}

