import { EQUIPMENT_TAGS, type EquipmentTag, type Profile } from "../types";
import { useI18n } from "../i18n/I18nProvider";

type Props = {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  onChange: (equipment: EquipmentTag[]) => void;
};

/**
 * What's actually available, not a permanent fact about the reader.
 *
 * A gym-goer trains at home some days and a machine at the gym isn't a
 * dumbbell at home, so this is meant to be flipped back and forth rather than
 * set once at onboarding — which is also why it lives here, in a panel next
 * to Account and History, instead of in the welcome form. Nothing is
 * selected by default: no preference stated shows every exercise in
 * catalogue order exactly as it always has, so opening this panel and
 * closing it again without touching anything changes nothing.
 */
export default function EquipmentPanel({ open, onClose, profile, onChange }: Props) {
  const { t } = useI18n();
  if (!open) return null;

  const current = new Set(profile.equipment ?? []);

  function toggle(tag: EquipmentTag) {
    const next = new Set(current);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    onChange([...next]);
  }

  return (
    <>
      <button className="workout-scrim" aria-label={t("equipmentPanel.close")} onClick={onClose} />
      <aside className="equipment-panel" aria-label={t("equipmentPanel.title")}>
        <div className="workout-head">
          <h2>{t("equipmentPanel.title")}</h2>
          <button className="workout-close" onClick={onClose} aria-label={t("equipmentPanel.close")}>
            ✕
          </button>
        </div>

        <p className="plans-intro">{t("equipmentPanel.intro")}</p>

        <div className="chip-row">
          {EQUIPMENT_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`chip ${current.has(tag) ? "chip-selected" : ""}`}
              onClick={() => toggle(tag)}
            >
              {t(`equipment.${tag}`)}
            </button>
          ))}
        </div>

        {/* Bodyweight work needs saying is never affected, or "why isn't
            Push-Up_Wide moving" is a fair question with no answer on screen. */}
        <p className="plan-note">{t("equipmentPanel.bodyweightNote")}</p>
      </aside>
    </>
  );
}
