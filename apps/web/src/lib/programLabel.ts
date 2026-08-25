/**
 * The position-based part of a workout's label — "Day 2" or "Week 7 ·
 * Session 1" — shared between `PlanLibrary.tsx`'s preview headings and
 * `WorkoutPanel.tsx`'s program tabs so the two always read the same way for
 * the same day. That agreement matters most for a plan like the combined
 * Russian routine, whose eighteen squat sessions (and eighteen bench, and
 * eighteen deadlift) would otherwise show as identical, undistinguishable
 * "Squat" headings with nothing to tell one from another.
 *
 *   a plan day, fixed length   "Week 3 · Session 2" — `weekFraming` is set
 *                              when the plan has more days than one week of
 *                              its own `perWeek` could hold, so it is a
 *                              program with a real end rather than a
 *                              rotation, and the week number is worth
 *                              saying.
 *   a plan day, a rotation     "Day 2" — Push/Pull/Legs, GZCLP, and the rest
 *                              repeat indefinitely; there is no "week" to
 *                              hang a session number on, only a position in
 *                              the rotation.
 *   no plan (or no position)   "Day N" from whatever `fallbackN` is given —
 *                              the caller's own idea of position, for a
 *                              hand-built workout or a preview row with
 *                              nothing else to go on.
 *
 * `nameKey`, when given, is appended after a " · " either way — "Day 2 ·
 * Push", "Week 7 · Session 1 · Bench" — never instead of the position, since
 * the position is what actually tells same-named days apart.
 */
export type PositionInfo = {
  dayIndex?: number;
  perWeek?: number;
  weekFraming?: boolean;
  nameKey?: string;
};

export function positionLabel(
  info: PositionInfo,
  t: (k: string, v?: Record<string, string | number>) => string,
  fallbackN: number,
): string {
  const named = info.nameKey ? ` · ${t(info.nameKey)}` : "";
  if (info.dayIndex && info.weekFraming && info.perWeek) {
    const week = Math.ceil(info.dayIndex / info.perWeek);
    const session = ((info.dayIndex - 1) % info.perWeek) + 1;
    return `${t("program.week", { week, session })}${named}`;
  }
  const n = info.dayIndex ?? fallbackN;
  return `${t("program.day", { n })}${named}`;
}
