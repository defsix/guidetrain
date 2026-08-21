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

  // BodyExplorer is loaded lazily (see App.tsx) so its Three.js weight never
  // blocks this screen's own first paint — but everyone ends up there,
  // whether that's someone filling in the form or one of the two redirects
  // below. Fetching it now, in the background, means the wait happened while
  // they were reading or typing rather than after they pressed the button.
  // A plain dynamic import rather than calling the lazy component itself:
  // this only wants the network request started, not anything rendered.
  useEffect(() => {
    void import("./BodyExplorer");
  }, []);

  // The splash: shown once per visit, and only once `auth.loading` has
  // settled — it's known synchronously for `profile`, but not for
  // `auth.session`, so starting any earlier risks showing the new-visitor
  // version to someone about to turn out signed in. Which version is a
  // separate question from whether one shows at all: someone `profile` or
  // `auth.session` already vouches for gets the quick, bar-less flash
  // (see Splash.tsx) rather than the full first-time one — recognition, not
  // a second loading screen for a page that has nothing left to load.
  const [splashPhase, setSplashPhase] = useState<"pending" | "showing" | "fading" | "done">(
    "pending",
  );
  const [splashQuick, setSplashQuick] = useState(false);

  useEffect(() => {
    if (splashPhase !== "pending" || auth.loading) return;
    setSplashQuick(Boolean(auth.session || profile));
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
    const hold = setTimeout(() => setSplashPhase("fading"), splashQuick ? 250 : 900);
    return () => clearTimeout(hold);
  }, [splashPhase, splashQuick]);

  useEffect(() => {
    if (splashPhase !== "fading") return;
    const fade = setTimeout(() => setSplashPhase("done"), splashQuick ? 250 : 500);
    return () => clearTimeout(fade);
  }, [splashPhase, splashQuick]);

  // Whoever never needed an account at all: this route rendered
  // unconditionally regardless of a saved profile, so reloading the app — a
  // new tab, a bookmark, a PWA relaunch — meant filling in the form again
  // every time, even though `useProfile` already had the answer before the
  // first paint. Redirect rather than skip the render entirely, so a fresh
  // sign-in and a returning visit both land here the same way.
  //
  // Deliberately keyed on `profile`, not `auth.session` — signing in does not
  // by itself mean a profile exists. `BodyExplorer` refuses to render without
  // one and bounces straight back here, and a redirect fired on session alone
  // would send it straight back to `/explore`, and the two would trade the
  // reader back and forth forever: this was a real bug, reached by signing in
  // before ever filling in the form (a new visitor's account button is right
  // there before the form is), or on any device with nothing local and
  // nothing synced yet. `useSync` above already pulls a remote profile down
  // on sign-in when one exists; once it lands, `profile` here goes from null
  // to real and this effect fires on its own — no separate session-triggered
  // redirect required. Someone signed in with truly nothing to pull down
  // simply stays on the form, which is correct: there is a profile to create,
  // not one to wait for.
  //
  // Also checks `auth.recovery`: a password-reset link signs the browser in
  // the same way an ordinary sign-in does, and whoever followed it almost
  // certainly already has a profile too — so without the check, this would
  // fire and carry the reader straight past the one screen the link existed
  // to reach. See the account panel, opened automatically below for the same
  // reason.
  useEffect(() => {
    if (splashPhase !== "done" || auth.recovery) return;
    if (profile) navigate("/explore", { replace: true });
  }, [splashPhase, profile, auth.recovery, navigate]);

  // A recovery link lands here with nowhere else to go — this screen is the
  // one place `<AccountPanel>` already exists on a fresh session, and the
  // panel itself is what actually shows the "set a new password" form.
  useEffect(() => {
    if (auth.recovery) setShowAccount(true);
  }, [auth.recovery]);

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
        <Splash fading={splashPhase === "fading"} quick={splashQuick} />
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
