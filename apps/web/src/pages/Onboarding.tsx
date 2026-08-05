import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AgeGroup, Gender, Profile } from "../types";
import { useProfile } from "../state/useProfile";
import { useTheme } from "../state/useTheme";
import ThemeToggle from "../components/ThemeToggle";
import LanguageToggle from "../components/LanguageToggle";
import { useT } from "../i18n/I18nProvider";

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
          <h1>{t("onboarding.title")}</h1>
          <p className="subtitle">{t("onboarding.subtitle")}</p>
        </div>
        <div className="header-controls">
          <LanguageToggle />
          <ThemeToggle pref={pref} onChange={setPref} />
        </div>
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
    </div>
  );
}
