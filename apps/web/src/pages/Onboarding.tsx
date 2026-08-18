import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AgeGroup, Profile } from "../types";
import { useProfile } from "../state/useProfile";
import { useTheme } from "../state/useTheme";
import { useAuth } from "../state/useAuth";
import { useSync } from "../state/useSync";
import ThemeToggle from "../components/ThemeToggle";
import AccountPanel from "../components/AccountPanel";
import Logo from "../components/Logo";
import Splash from "../components/Splash";
import { useT } from "../i18n/I18nProvider";
import muscleMap from "../anatomy/muscle-map.json";
import exercises from "../anatomy/exercises.json";

// Counted from the data rather than typed in, because a number in a headline is
// exactly the kind of thing that quietly stops being true. Both files are
// already in the bundle for the explorer, so this costs nothing.
const MUSCLE_COUNT = muscleMap.zones.filter((z) => z.selectable !== false).length;
const EXERCISE_COUNT = new Set(
  Object.values(exercises.muscles).flatMap((list) => list.map((x) => x.id)),
).size;

// The numeric bands read the same in every language, so only the two worded
// ends carry a translation key; the rest are digits and stay as they are.
const AGE_GROUPS: { value: AgeGroup; key?: string; label?: string }[] = [
  { value: "teen", key: "age.teen" },
  { value: "18-29", label: "18 - 29" },
  { value: "30-44", label: "30 - 44" },
  { value: "45-59", label: "45 - 59" },
  { value: "60+", key: "age.60plus" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { profile, setProfile } = useProfile();
  const { pref, setPref } = useTheme();
  const auth = useAuth();
  const sync = useSync(auth.userId);
  const [showAccount, setShowAccount] = useState(false);
  const t = useT();
  const [username, setUsername] = useState("");
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [bodyWeight, setBodyWeight] = useState("");

  // A returning user should never retype what their account already knows.
  // Signing in here starts the same merge BodyExplorer would run — this just
  // means nobody has to fill in the form first to reach the button that makes
  // it irrelevant.
  useEffect(() => {
    if (auth.session) navigate("/explore", { replace: true });
  }, [auth.session, navigate]);

  // The same idea for whoever never needed an account at all: this route
  // rendered unconditionally regardless of a saved profile, so reloading the
  // app — a new tab, a bookmark, a PWA relaunch — meant filling in the form
  // again every time, even though `useProfile` already had the answer before
  // the first paint. Redirect rather than skip the render entirely, so the
  // effect fires the same way the sign-in one does above.
  useEffect(() => {
    if (profile) navigate("/explore", { replace: true });
  }, [profile, navigate]);

  // BodyExplorer is loaded lazily (see App.tsx) so its Three.js weight never
  // blocks this screen's own first paint — but everyone ends up there,
  // whether that's someone filling in the form or one of the two redirects
  // above. Fetching it now, in the background, means the wait happened while
  // they were reading or typing rather than after they pressed the button.
  // A plain dynamic import rather than calling the lazy component itself:
  // this only wants the network request started, not anything rendered.
  useEffect(() => {
    void import("./BodyExplorer");
  }, []);

  // The splash: shown once, and only once the two redirects above have had
  // their chance to fire instead. `profile` is known synchronously — a
  // returning visitor never risks seeing this start — but `auth.loading`
  // is not, so the splash stays off until a session has been ruled out too.
  // Skipping that check would mean occasionally starting the animation for
  // someone about to be sent straight to the explorer a moment later.
  const [splashPhase, setSplashPhase] = useState<"pending" | "showing" | "fading" | "done">(
    "pending",
  );

  useEffect(() => {
    if (splashPhase !== "pending" || auth.loading || auth.session || profile) return;
    setSplashPhase("showing");
  }, [splashPhase, auth.loading, auth.session, profile]);

  useEffect(() => {
    if (splashPhase !== "showing") return;
    // Motion nobody asked for is the one thing worse than a screen that took
    // a moment to appear.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setSplashPhase("done");
      return;
    }
    const hold = setTimeout(() => setSplashPhase("fading"), 900);
    return () => clearTimeout(hold);
  }, [splashPhase]);

  useEffect(() => {
    if (splashPhase !== "fading") return;
    const fade = setTimeout(() => setSplashPhase("done"), 500);
    return () => clearTimeout(fade);
  }, [splashPhase]);

  // A comma is the decimal separator in most of the ten languages, so take
  // either — though this is asked to the nearest whole unit and most people
  // will type one.
  const weightNum = Math.round(parseFloat(bodyWeight.replace(",", ".")));
  const weightOk = Number.isFinite(weightNum) && weightNum > 0;

  const canContinue = username.trim().length > 0 && ageGroup !== null && weightOk;

  function handleContinue() {
    if (!canContinue) return;
    const profile: Profile = {
      username: username.trim(),
      ageGroup: ageGroup!,
      bodyWeight: weightNum,
    };
    setProfile(profile);
    navigate("/explore");
  }

  const done = [username.trim().length > 0, ageGroup !== null, weightOk]
    .filter(Boolean).length;

  return (
    <div className="onboarding">
      {/* Pending covers the form with a blank, un-marked overlay rather than
          nothing — the alternative is a flash of the form itself while
          auth.loading is still being resolved, for however briefly. */}
      {splashPhase === "pending" && <div className="splash" aria-hidden="true" />}
      {(splashPhase === "showing" || splashPhase === "fading") && (
        <Splash fading={splashPhase === "fading"} />
      )}
      <div className="onboarding-hero">
        <div className="onboarding-head">
          {/* The mark carries the name here rather than an all-caps label:
              this is the one screen with room for it, and the first thing
              anybody sees of the app. */}
          <Logo size={38} withName />
          <div className="header-controls">
            {/* Hidden with no project configured, exactly as it is once
                signed in — see AccountPanel. */}
            {auth.available && (
              <button
                className="account-button"
                onClick={() => setShowAccount(true)}
                aria-expanded={showAccount}
              >
                {t("account.title")}
              </button>
            )}
            <ThemeToggle pref={pref} onChange={setPref} />
          </div>
        </div>
        <h1>{t("onboarding.title")}</h1>
        <p className="subtitle">{t("onboarding.subtitle")}</p>
        {/* What is actually behind the door. Language count used to sit here
            too, but it isn't something a visitor evaluates the app by — it's
            true of the app regardless of which one they read it in, and
            invisible to them either way. */}
        <ul className="stats">
          <li>{t("onboarding.statMuscles", { count: MUSCLE_COUNT })}</li>
          <li>{t("onboarding.statExercises", { count: EXERCISE_COUNT })}</li>
        </ul>
      </div>

      <label className="field">
        <span>{t("onboarding.username")}</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t("onboarding.usernamePlaceholder")}
          maxLength={32}
        />
      </label>

      {/* An exact figure, not a band. Age is context; this is arithmetic — it is
          the load on every bodyweight exercise in the catalogue, and you cannot
          put a band on a bar. */}
      <div className="field">
        <span>{t("onboarding.bodyWeight")}</span>
        <div className="weight-row">
          <input
            value={bodyWeight}
            onChange={(e) => setBodyWeight(e.target.value)}
            inputMode="numeric"
            placeholder={t("onboarding.bodyWeightPlaceholder")}
            aria-label={t("onboarding.bodyWeight")}
            maxLength={5}
          />
          <span className="cap">{t("unit.kg")}</span>
        </div>
        <p className="field-note">{t("onboarding.bodyWeightWhy")}</p>
      </div>

      <fieldset className="field">
        <legend>{t("onboarding.ageGroup")}</legend>
        <div className="chip-row">
          {AGE_GROUPS.map((a) => (
            <button
              key={a.value}
              type="button"
              className={`chip ${ageGroup === a.value ? "chip-selected" : ""}`}
              onClick={() => setAgeGroup(a.value)}
            >
              {a.key ? t(a.key) : a.label}
            </button>
          ))}
        </div>
      </fieldset>

      <button className="primary-button" disabled={!canContinue} onClick={handleContinue}>
        {t("onboarding.continue")}
      </button>
      {/* The button greys out until all three are answered and never said why.
          Announced politely so it reaches a screen reader when it changes,
          rather than interrupting whatever is being read. */}
      <p className="form-progress" aria-live="polite">
        {canContinue ? '' : t("onboarding.progress", { count: 3 - done })}
      </p>

      <AccountPanel open={showAccount} onClose={() => setShowAccount(false)} auth={auth} sync={sync} />
    </div>
  );
}
