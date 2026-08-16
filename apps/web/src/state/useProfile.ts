import { useCallback, useEffect, useState } from "react";
import type { Profile } from "../types";
import { write, remove, onWrite } from "../lib/storage";

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

  // A write this hook did not make — sync pulling a profile down after
  // sign-in — has to be picked up too, or the app keeps showing whatever was
  // on screen before the merge until the next reload.
  useEffect(() => onWrite((key) => {
    if (key === STORAGE_KEY) setProfileState(readProfile());
  }), []);

  const setProfile = useCallback((next: Profile) => {
    // Routed through lib/storage rather than localStorage directly, so a sync
    // layer can hear about every write without this hook knowing one exists.
    write(STORAGE_KEY, next);
    setProfileState(next);
  }, []);

  const clearProfile = useCallback(() => {
    remove(STORAGE_KEY);
    setProfileState(null);
  }, []);

  return { profile, setProfile, clearProfile };
}
