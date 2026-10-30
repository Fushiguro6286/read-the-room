import { describe, expect, it } from "vitest";
import { batchCsv, MAX_BATCH_ROOMS, parseRooms, stopRoom } from "../lib/batch";
import type { RunResult } from "../lib/types";

describe("batch mode", () => {
  it("parses one room per line, drops blanks and duplicates, caps the count", () => {
    expect(parseRooms(" Austin, 25–34 \n\naustin, 25–34\nx\nMiami\nA1\nB1\nC1\nD1")).toEqual(["Austin, 25–34", "Miami", "A1", "B1", "C1"].slice(0, MAX_BATCH_ROOMS));
  });

  it("labels tour stops", () => {
    expect(stopRoom({ city: "Austin", ageRange: "25–34" })).toBe("Austin, ages 25–34");
    expect(stopRoom({ city: " Austin ", ageRange: "" })).toBe("Austin");
    expect(stopRoom({ city: "Austin", ageRange: "All ages" })).toBe("Austin");
    expect(stopRoom({ city: "Brooklyn", ageRange: "21 and over" })).toBe("Brooklyn, ages 21 and over");
  });

  it("writes CSV with quotes escaped and only accepted swaps", () => {
    const r = {
      room: { label: "Austin, ages 25–34" },
      roomScoreBefore: 49,
      roomScoreAfter: 72,
      finalText: 'He said "hi", then left.',
      references: [
        { surface: "Friends", swap: { entityName: "New Girl", accepted: true } },
        { surface: "Drake", swap: { entityName: "SZA", accepted: false } },
        { surface: "Oprah" },
      ],
    } as unknown as RunResult;
    expect(batchCsv([r]).split("\r\n")).toEqual([
      '"Room","Room Score before","Room Score after","Swaps","Rewritten text"',
      '"Austin, ages 25–34","49","72","Friends → New Girl","He said ""hi"", then left."',
    ]);
  });
});
