import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AgeGroup, Gender, Profile } from "../types";
import { useProfile } from "../state/useProfile";
import { useTheme } from "../state/useTheme";
import ThemeToggle from "../components/ThemeToggle";
import Logo from "../components/Logo";
import { useT } from "../i18n/I18nProvider";
import { LOCALES } from "../i18n";
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

const GENDERS: Gender[] = ["female", "male", "other"];

export default function Onboarding() {
  const navigate = useNavigate();
  const { setProfile } = useProfile();
  const { pref, setPref } = useTheme();
  const t = useT();
  const [username, setUsername] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [bodyWeight, setBodyWeight] = useState("");

  // A comma is the decimal separator in most of the ten languages, so take
  // either — though this is asked to the nearest whole unit and most people
  // will type one.
  const weightNum = Math.round(parseFloat(bodyWeight.replace(",", ".")));
  const weightOk = Number.isFinite(weightNum) && weightNum > 0;

  const canContinue =
    username.trim().length > 0 && gender !== null && ageGroup !== null && weightOk;

  function handleContinue() {
    if (!canContinue) return;
    const profile: Profile = {
      username: username.trim(),
      gender: gender!,
      ageGroup: ageGroup!,
      bodyWeight: weightNum,
    };
    setProfile(profile);
    navigate("/explore");
  }

  const done = [username.trim().length > 0, gender !== null, ageGroup !== null, weightOk]
    .filter(Boolean).length;

  return (
    <div className="onboarding">
      <div className="onboarding-hero">
        <div className="onboarding-head">
          {/* The mark carries the name here rather than an all-caps label:
              this is the one screen with room for it, and the first thing
              anybody sees of the app. */}
          <Logo size={38} withName />
          <div className="header-controls">
            <ThemeToggle pref={pref} onChange={setPref} />
          </div>
        </div>
        <h1>{t("onboarding.title")}</h1>
        <p className="subtitle">{t("onboarding.subtitle")}</p>
        {/* What is actually behind the door, in three numbers. The first screen
            used to promise only that answering three questions led somewhere. */}
        <ul className="stats">
          <li>{t("onboarding.statMuscles", { count: MUSCLE_COUNT })}</li>
          <li>{t("onboarding.statExercises", { count: EXERCISE_COUNT })}</li>
          <li>{t("onboarding.statLanguages", { count: LOCALES.length })}</li>
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

      <fieldset className="field">
        <legend>{t("onboarding.gender")}</legend>
        <div className="chip-row">
          {GENDERS.map((g) => (
            <button
              key={g}
              type="button"
              className={`chip ${gender === g ? "chip-selected" : ""}`}
              onClick={() => setGender(g)}
            >
              {t(`gender.${g}`)}
            </button>
          ))}
        </div>
      </fieldset>

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
      {/* The button greys out until all four are answered and never said why.
          Announced politely so it reaches a screen reader when it changes,
          rather than interrupting whatever is being read. */}
      <p className="form-progress" aria-live="polite">
        {canContinue ? '' : t("onboarding.progress", { count: 4 - done })}
      </p>
    </div>
  );
}
