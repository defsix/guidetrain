import type { MuscleGroup } from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export async function fetchMuscleGroups(): Promise<MuscleGroup[]> {
  const res = await fetch(`${API_URL}/api/muscle-groups`);
  if (!res.ok) throw new Error(`Failed to load muscle groups (${res.status})`);
  return res.json();
}
