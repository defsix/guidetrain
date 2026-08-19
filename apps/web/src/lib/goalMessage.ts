import type { TFn } from "../i18n";
import type { GoalPace } from "./progression";

/**
 * The pace verdict as one translated sentence, shared by every place a goal
 * shows up — the Stats page's own list, `ProgressionPanel`, and a plan
 * preview row. Kept in one place so a wording fix can't land in two of the
 * three and quietly disagree with the third.
 */
export function goalPaceMessage(t: TFn, pace: GoalPace): string {
  switch (pace.status) {
    case "noBasis":
      return t("stats.goals.noBasis");
    case "reached":
      return t("stats.goals.reached");
    case "onPace":
      return t("stats.goals.onPace", {
        count: pace.cyclesNeeded,
        weeksNeeded: pace.weeksNeeded,
        weeksAvailable: pace.weeksAvailable,
      });
    case "behind":
      return pace.weeksAvailable > 0
        ? t("stats.goals.behind", {
            count: pace.cyclesNeeded,
            weeksNeeded: pace.weeksNeeded,
            weeksAvailable: pace.weeksAvailable,
          })
        : t("stats.goals.pastDeadline", {
            count: pace.cyclesNeeded,
            weeksNeeded: pace.weeksNeeded,
          });
  }
}

/** A goal's deadline, formatted the same way everywhere it's shown. */
export function goalDateLabel(targetDate: number): string {
  return new Date(targetDate).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
