import type { MuscleGroup } from "../types";
import staticMuscleGroups from "../../../../data/muscle-groups.json";

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

// Phase 1 has no writes yet, so when there's no API configured (e.g. the
// static GitHub Pages build) we serve the same seed data bundled at build time.
export async function fetchMuscleGroups(): Promise<MuscleGroup[]> {
  if (!API_URL) {
    return staticMuscleGroups as MuscleGroup[];
  }
  const res = await fetch(`${API_URL}/api/muscle-groups`);
  if (!res.ok) throw new Error(`Failed to load muscle groups (${res.status})`);
  return res.json();
}
