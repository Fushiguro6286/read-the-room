import { describe, expect, it, vi } from "vitest";
import { applySwaps, classify, namesMatch, roomScore, splitSentences, toggleSwap } from "@/lib/score";
import { ageBuckets } from "@/lib/room";
import { locateReferences, pickMatch } from "@/lib/agent";
import type { ReferenceResult } from "@/lib/types";

vi.mock("@/lib/llm", () => ({})); // pure helpers only; no LLM in unit tests

const text = "I said, so you're like Oprah? He said no, more like MrBeast. I keep a Blockbuster card.";

describe("offsets", () => {
  it("locates exact substrings, drops duplicates and non-matches", () => {
    const refs = locateReferences(
      text,
      [
        { surface: "MrBeast", guessedType: "person" },
        { surface: "Oprah", guessedType: "person" },
        { surface: "oprah", guessedType: "person" },
        { surface: "Netflix", guessedType: "brand" },
      ],
      8,
    );
    expect(refs.map((r) => r.surface)).toEqual(["Oprah", "MrBeast"]);
    for (const r of refs) expect(text.slice(r.start, r.end)).toBe(r.surface);
    expect(refs.map((r) => r.sentenceIndex)).toEqual([0, 1]);
  });

  it("caps at max references", () => {
    expect(locateReferences(text, [{ surface: "Oprah", guessedType: "person" }, { surface: "MrBeast", guessedType: "person" }], 1)).toHaveLength(1);
  });

  it("splits sentences with offsets into the original", () => {
    const s = splitSentences(text);
    expect(s).toHaveLength(3);
    for (const x of s) expect(text.slice(x.start, x.end)).toBe(x.text);
  });
});

describe("classification and Room Score", () => {
  it("classifies with calibrated thresholds", () => {
    expect([classify(0.95), classify(0.85), classify(0.05), classify(undefined)]).toEqual(["strong", "ok", "weak", "unknown"]);
  });

  const ref = (id: string, affinity: number | undefined, swap?: number): ReferenceResult => ({
    id, surface: id, start: 0, end: 1, sentenceIndex: 0, tags: [], affinity, status: classify(affinity),
    swap: swap === undefined ? undefined : { entityId: "x", entityName: "X", entityType: "t", affinity: swap, sharedTags: [], originalSentence: "", rewrittenSentence: "", sentenceStart: 0, sentenceEnd: 0, lengthDelta: 0, accepted: true },
  });

  it("averages known references only and uses accepted swaps for 'after'", () => {
    const refs = [ref("a", 0.9), ref("b", 0.05, 0.95), ref("c", undefined)];
    expect(roomScore(refs, false)).toBe(48); // (0.9 + 0.05) / 2
    expect(roomScore(refs, true)).toBe(93); // (0.9 + 0.95) / 2
    expect(roomScore(toggleSwap(refs, 0, false), true)).toBe(48);
    expect(roomScore([ref("c", undefined)], false)).toBe(0);
  });
});

describe("applySwaps", () => {
  it("replaces accepted sentences by offset and restores on revert", () => {
    const [, s1] = splitSentences(text);
    const refs: ReferenceResult[] = [
      { id: "r1", surface: "MrBeast", start: 0, end: 0, sentenceIndex: 1, tags: [], status: "weak",
        swap: { entityId: "e", entityName: "Steve Harvey", entityType: "person", affinity: 0.97, sharedTags: [], originalSentence: s1.text, rewrittenSentence: "He said no, more like Steve Harvey.", sentenceStart: s1.start, sentenceEnd: s1.end, lengthDelta: 0, accepted: true } },
    ];
    expect(applySwaps(text, refs)).toBe("I said, so you're like Oprah? He said no, more like Steve Harvey. I keep a Blockbuster card.");
    expect(applySwaps(text, toggleSwap(refs, s1.start, false))).toBe(text);
  });
});

describe("resolution matching", () => {
  it("accepts close or contained names, rejects unrelated ones", () => {
    expect(namesMatch("Oprah", "Oprah Winfrey")).toBe(true);
    expect(namesMatch("Toyota Camry", "Toyota")).toBe(true);
    expect(namesMatch("Mister Rogers", "Mister Rogers' Neighborhood")).toBe(true);
    expect(namesMatch("Friends", "Nathaly Cherie")).toBe(false);
    expect(namesMatch("Drake", "Drake Bell")).toBe(true);
  });

  it("prefers an exact name over an earlier partial match", () => {
    const e = (name: string) => ({ id: name, name, type: "urn:entity:artist", tags: [] });
    expect(pickMatch("Drake", [e("Drake Bell"), e("Drake")])?.name).toBe("Drake");
  });
});

describe("age buckets", () => {
  it("maps ranges to every overlapping Qloo bucket", () => {
    expect(ageBuckets(45, 60)).toBe("45_to_54,55_and_older");
    expect(ageBuckets(25, 34)).toBe("25_to_29,30_to_34");
    expect(ageBuckets(55, null)).toBe("55_and_older");
    expect(ageBuckets(null, null)).toBeUndefined();
  });
});
