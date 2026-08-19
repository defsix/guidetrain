import { describe, expect, it } from "vitest";
import { injuryFor, isAvoided } from "./injuries";

describe("injuryFor", () => {
  const benchPress = { primary: ["pec"] };
  const squat = { primary: ["quad"] };

  it("finds nothing when the exercise's primary muscle isn't marked", () => {
    expect(injuryFor(benchPress, { quad: { mode: "avoid", setAt: 1 } })).toBeNull();
  });

  it("returns the mode and muscle when the primary muscle is marked", () => {
    expect(injuryFor(benchPress, { pec: { mode: "warn", setAt: 1 } })).toEqual({
      mode: "warn",
      muscle: "pec",
    });
  });

  it("checks every primary muscle, not just the first", () => {
    const rowVariant = { primary: ["lat", "bic"] };
    expect(injuryFor(rowVariant, { bic: { mode: "avoid", setAt: 1 } })).toEqual({
      mode: "avoid",
      muscle: "bic",
    });
  });

  it("ignores a muscle the exercise only trains as secondary", () => {
    // Same shape a real exercise would have — pec primary, tri secondary.
    const bench = { primary: ["pec"], secondary: ["tri"] };
    expect(injuryFor(bench, { tri: { mode: "avoid", setAt: 1 } })).toBeNull();
  });

  it("no injuries marked at all", () => {
    expect(injuryFor(squat, {})).toBeNull();
  });
});

describe("isAvoided", () => {
  const squat = { primary: ["quad"] };

  it("true only for an 'avoid' injury on the primary muscle", () => {
    expect(isAvoided(squat, { quad: { mode: "avoid", setAt: 1 } })).toBe(true);
  });

  it("false for a 'warn' injury — warn never excludes", () => {
    expect(isAvoided(squat, { quad: { mode: "warn", setAt: 1 } })).toBe(false);
  });

  it("false when nothing is marked", () => {
    expect(isAvoided(squat, {})).toBe(false);
  });
});
