import type { TFn } from "../i18n";
import type { InjuryMode } from "../state/useInjuries";

/**
 * A short badge for a suggestion list — the partner list, the swap list —
 * where the row already carries the exercise's own name and there is no
 * room for the muscle too.
 */
export function injuryTag(t: TFn, mode: InjuryMode): string {
  return mode === "avoid" ? t("injuryPanel.avoidTag") : t("injuryPanel.warnTag");
}

/**
 * The full sentence, naming the injured muscle — for a plan preview row or
 * the anatomy readout, where there's room to say which injury is behind the
 * flag. Shared so the wording can't drift between the two.
 */
export function injuryNote(t: TFn, mode: InjuryMode, muscleName: string): string {
  return mode === "avoid"
    ? t("injuryPanel.avoidNote", { muscle: muscleName })
    : t("injuryPanel.warnNote", { muscle: muscleName });
}
