import { describe, expect, it } from "vitest";
import { validateRewrite } from "@/lib/llm";

const weak = [{ referenceId: "r1", candidates: [{ entityId: "A", name: "Steve Harvey", type: "urn:entity:person", tags: [], affinity: 0.97 }] }];

describe("swap validation", () => {
  it("accepts a pick from the candidate list that appears in the sentence", () => {
    expect(validateRewrite(weak, { picks: [{ referenceId: "r1", entityId: "A" }], rewrittenSentence: "More like Steve Harvey.", keepOriginal: false })).toBeNull();
  });
  it("rejects an entity that Qloo did not offer", () => {
    expect(validateRewrite(weak, { picks: [{ referenceId: "r1", entityId: "INVENTED" }], rewrittenSentence: "More like Steve Harvey.", keepOriginal: false })).toMatch(/pick/);
  });
  it("rejects a missing pick or a sentence without the chosen name", () => {
    expect(validateRewrite(weak, { picks: [], rewrittenSentence: "x", keepOriginal: false })).toMatch(/pick/);
    expect(validateRewrite(weak, { picks: [{ referenceId: "r1", entityId: "A" }], rewrittenSentence: "More like Oprah.", keepOriginal: false })).toMatch(/must contain/);
  });
});

describe("gemini response reading", () => {
  it("reads output_text, or the last model_output step", async () => {
    const { geminiText } = await import("@/lib/llm");
    expect(geminiText({ output_text: '{"a":1}' })).toBe('{"a":1}');
    expect(geminiText({ steps: [{ type: "thought", content: [{ text: "x" }] }, { type: "model_output", content: [{ text: '{"a":' }, { text: "1}" }] }] })).toBe('{"a":1}');
    expect(geminiText({})).toBe("");
  });
});

describe("keepOriginal", () => {
  it("is valid without picks when no candidate fits", () => {
    expect(validateRewrite(weak, { picks: [], rewrittenSentence: "", keepOriginal: true })).toBeNull();
  });
});

describe("partial picks", () => {
  const two = [...weak, { referenceId: "r2", candidates: [{ entityId: "B", name: "Halal Guys", type: "urn:entity:brand", tags: [], affinity: 0.95 }] }];
  it("allows swapping only some references", () => {
    expect(validateRewrite(two, { picks: [{ referenceId: "r2", entityId: "B" }], rewrittenSentence: "A Halal Guys stop.", keepOriginal: false })).toBeNull();
  });
  it("rejects unknown reference ids", () => {
    expect(validateRewrite(two, { picks: [{ referenceId: "r9", entityId: "B" }], rewrittenSentence: "Halal Guys", keepOriginal: false })).toMatch(/unknown/);
  });
});

describe("suggestions", () => {
  it("only accepts snapshot entities, listed sentences, and the name in the sentence", async () => {
    const { validateSuggestions } = await import("@/lib/llm");
    const sents = [{ index: 0 }];
    const cands = [{ entityId: "S1", name: "Greenleaf", category: "TV show" }];
    expect(validateSuggestions(sents, cands, { suggestions: [{ sentenceIndex: 0, entityId: "S1", suggestedSentence: "Like Greenleaf." }] })).toBeNull();
    expect(validateSuggestions(sents, cands, { suggestions: [{ sentenceIndex: 0, entityId: "MADE-UP", suggestedSentence: "Like X." }] })).toMatch(/not in the candidate/);
    expect(validateSuggestions(sents, cands, { suggestions: [{ sentenceIndex: 3, entityId: "S1", suggestedSentence: "Greenleaf" }] })).toMatch(/sentenceIndex/);
  });
});
