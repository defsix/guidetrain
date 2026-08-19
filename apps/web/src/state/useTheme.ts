import { useCallback, useEffect, useState } from "react";
import { setNativeStatusBarAppearance } from "../lib/nativeDisplayBridge";

export type ThemePref = "light" | "dark" | "auto";
/** What's actually on screen once "auto" has consulted the device. */
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "guidetrain.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function readThemePref(): ThemePref {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "light" || raw === "dark" || raw === "auto" ? raw : "auto";
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref !== "auto") return pref;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/** Applied before React renders too (see main.tsx), so there's no light flash. */
export function applyTheme(pref: ThemePref) {
  document.documentElement.dataset.theme = pref;
}

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(() => readThemePref());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readThemePref()));

  const setPref = useCallback((next: ThemePref) => {
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    setPrefState(next);
    setResolved(resolveTheme(next));
  }, []);

  // On "auto", follow the device if the user flips it while we're open.
  useEffect(() => {
    if (pref !== "auto") return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => setResolved(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  useEffect(() => applyTheme(pref), [pref]);

  // No-op on the plain website; inside the native shells, keeps the status
  // bar's icon color matching what's actually on screen (see useTheme.ts's
  // own doc comment above) rather than only the device's system appearance.
  useEffect(() => setNativeStatusBarAppearance(resolved === "light"), [resolved]);

  return { pref, resolved, setPref };
}
