import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AgeGroup, Gender, Profile } from "../types";
import { useProfile } from "../state/useProfile";
import { useTheme } from "../state/useTheme";
import ThemeToggle from "../components/ThemeToggle";

const AGE_GROUPS: { value: AgeGroup; label: string }[] = [
  { value: "teen", label: "Under 18" },
  { value: "18-29", label: "18 - 29" },
  { value: "30-44", label: "30 - 44" },
  { value: "45-59", label: "45 - 59" },
  { value: "60+", label: "60+" },
];

const GENDERS: { value: Gender; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other / Prefer not to say" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { setProfile } = useProfile();
  const { pref, setPref } = useTheme();
  const [username, setUsername] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);

  const canContinue = username.trim().length > 0 && gender !== null && ageGroup !== null;

  function handleContinue() {
    if (!canContinue) return;
    const profile: Profile = { username: username.trim(), gender: gender!, ageGroup: ageGroup! };
    setProfile(profile);
    navigate("/explore");
  }

  return (
    <div className="onboarding">
      <div className="onboarding-head">
        <div>
          <h1>Welcome to GuideTrain</h1>
          <p className="subtitle">A few quick details so we can tailor your training.</p>
        </div>
        <ThemeToggle pref={pref} onChange={setPref} />
      </div>

      <label className="field">
        <span>Username</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. iron_ada"
          maxLength={32}
        />
      </label>

      <fieldset className="field">
        <legend>Gender</legend>
        <div className="chip-row">
          {GENDERS.map((g) => (
            <button
              key={g.value}
              type="button"
              className={`chip ${gender === g.value ? "chip-selected" : ""}`}
              onClick={() => setGender(g.value)}
            >
              {g.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Age group</legend>
        <div className="chip-row">
          {AGE_GROUPS.map((a) => (
            <button
              key={a.value}
              type="button"
              className={`chip ${ageGroup === a.value ? "chip-selected" : ""}`}
              onClick={() => setAgeGroup(a.value)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </fieldset>

      <button className="primary-button" disabled={!canContinue} onClick={handleContinue}>
        Continue to body explorer
      </button>
    </div>
  );
}
