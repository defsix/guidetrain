export type Gender = "male" | "female" | "other";

export type AgeGroup = "teen" | "18-29" | "30-44" | "45-59" | "60+";

export interface Profile {
  username: string;
  gender: Gender;
  ageGroup: AgeGroup;
}

export interface MuscleGroup {
  id: string;
  slug: string;
  name: string;
  latinName: string;
  description: string;
  sortOrder: number;
}

export interface MusclePart {
  side: "left" | "right";
  file: string;
}

export interface MuscleGroupManifestEntry {
  slug: string;
  parts: MusclePart[];
}
