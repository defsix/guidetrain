import type { SetEntry } from "../state/useLog";
import { downloadFile } from "./download";

/** One CSV field, quoted only when it actually needs it. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Every logged set as a CSV file, oldest first — a spreadsheet reads better
 * top-to-bottom-in-time than History's own newest-first list does. One row
 * per set rather than one per session: a session is just sets that share a
 * date, which any spreadsheet can re-group with a pivot table if wanted, and
 * flattening loses nothing a grouped export would have kept.
 */
export function setsToCsv(sets: SetEntry[], nameFor: (id: string) => string): string {
  const header = ["Date", "Time", "Exercise", "Weight (kg)", "Reps"].map(csvField).join(",");
  const rows = [...sets]
    .sort((a, b) => a.at - b.at)
    .map((s) => {
      const d = new Date(s.at);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
      const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      return [date, time, nameFor(s.id), String(s.weight), String(s.reps)].map(csvField).join(",");
    });
  // CRLF: the format Excel itself writes, and the one every other CSV reader
  // already tolerates.
  return [header, ...rows].join("\r\n");
}

/**
 * Hands a CSV file to the reader — see `download.ts` for how that differs
 * between the plain website and the Android shell.
 */
export function downloadCsv(filename: string, csv: string): void {
  // The BOM is what makes Excel open the file as UTF-8 rather than guessing
  // a local codepage — without it, any exercise name outside plain ASCII (a
  // translated name, for instance) renders as mojibake the moment Excel
  // opens it, even though every other CSV reader was already fine.
  downloadFile(filename, "﻿" + csv, "text/csv;charset=utf-8;");
}
