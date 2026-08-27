import { describe, expect, it } from "vitest";
import { findDuplicateExerciseName } from "./duplicateExercise";

describe("findDuplicateExerciseName", () => {
  it("catches an exact match regardless of case", () => {
    expect(findDuplicateExerciseName("landmine press", ["Landmine Press"])).toBe("Landmine Press");
  });

  it("catches extra whitespace and punctuation", () => {
    expect(findDuplicateExerciseName("  Landmine   Press!! ", ["Landmine Press"])).toBe("Landmine Press");
  });

  it("catches a near-miss like a dropped or added word", () => {
    expect(findDuplicateExerciseName("Landmine Presses", ["Landmine Press"])).toBe("Landmine Press");
  });

  it("catches a typo", () => {
    expect(findDuplicateExerciseName("Landmien Press", ["Landmine Press"])).toBe("Landmine Press");
  });

  it("does not flag a genuinely different exercise that merely shares a word", () => {
    expect(findDuplicateExerciseName("Squat", ["Front Squat", "Overhead Press"])).toBeNull();
  });

  it("does not flag an unrelated name", () => {
    expect(findDuplicateExerciseName("Cable Face Pull", ["Barbell Squat", "Dumbbell Curl"])).toBeNull();
  });

  it("returns the closest match when more than one candidate is similar", () => {
    const result = findDuplicateExerciseName("Landmine Press", [
      "Overhead Press",
      "Landmine Press ",
    ]);
    expect(result).toBe("Landmine Press ");
  });

  it("treats an empty or blank name as no match", () => {
    expect(findDuplicateExerciseName("   ", ["Landmine Press"])).toBeNull();
  });

  it("ignores blank candidates", () => {
    expect(findDuplicateExerciseName("Landmine Press", ["", "   "])).toBeNull();
  });
});
