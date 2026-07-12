import { useCallback, useState } from "react";
import type { Profile } from "../types";

const STORAGE_KEY = "guidetrain.profile";

function readProfile(): Profile | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

export function useProfile() {
  const [profile, setProfileState] = useState<Profile | null>(() => readProfile());

  const setProfile = useCallback((next: Profile) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setProfileState(next);
  }, []);

  const clearProfile = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setProfileState(null);
  }, []);

  return { profile, setProfile, clearProfile };
}
