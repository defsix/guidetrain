import { describe, expect, it } from "vitest";
import type { SetEntry } from "../state/useLog";
import { setsToCsv } from "./csvExport";

const set = (over: Partial<SetEntry>): SetEntry => ({
  uid: "u",
  id: "Barbell_Squat",
  weight: 100,
  reps: 5,
  at: Date.UTC(2026, 0, 15, 9, 30),
  ...over,
});

describe("setsToCsv", () => {
  it("has a header row and one row per set, oldest first", () => {
    const csv = setsToCsv(
      [
        set({ uid: "b", at: Date.UTC(2026, 0, 16), weight: 105 }),
        set({ uid: "a", at: Date.UTC(2026, 0, 15), weight: 100 }),
      ],
      () => "Barbell Squat",
    );
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Date,Time,Exercise,Weight (kg),Reps");
    // Oldest (100 kg, the 15th) comes before the newer 105 kg row.
    expect(lines[1]).toContain("100");
    expect(lines[2]).toContain("105");
  });

  it("quotes a name that contains a comma", () => {
    const csv = setsToCsv([set({})], () => "Squat, Barbell");
    expect(csv).toContain('"Squat, Barbell"');
  });

  it("produces no rows at all for an empty log, just the header", () => {
    const csv = setsToCsv([], () => "");
    expect(csv.split("\r\n")).toEqual(["Date,Time,Exercise,Weight (kg),Reps"]);
  });
});
