// Batch mode helpers, safe to import in the browser.
import type { RunResult } from "./types";

export const MAX_BATCH_ROOMS = 5;

/** One room per non-empty line, de-duplicated, capped. */
export function parseRooms(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split("\n")
    .map((r) => r.trim().slice(0, 200))
    .filter((r) => r.length >= 2 && !seen.has(r.toLowerCase()) && seen.add(r.toLowerCase()))
    .slice(0, MAX_BATCH_ROOMS);
}

/** "Austin, ages 25–34" from a tour stop. */
export const stopRoom = (s: { city: string; ageRange: string }) => [s.city.trim(), /\d/.test(s.ageRange) && `ages ${s.ageRange.trim()}`].filter(Boolean).join(", ");

export const swapsOf = (r: RunResult) => r.references.filter((x) => x.swap?.accepted).map((x) => `${x.surface} → ${x.swap!.entityName}`);

const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/** CSV with one row per room. */
export function batchCsv(results: RunResult[]): string {
  const head = ["Room", "Room Score before", "Room Score after", "Swaps", "Rewritten text"];
  const rows = results.map((r) => [r.room.label, r.roomScoreBefore, r.roomScoreAfter, swapsOf(r).join("; "), r.finalText]);
  return [head, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}
