import { describe, expect, it } from "vitest";
import { validateRewrite } from "@/lib/llm";

const weak = [{ referenceId: "r1", candidates: [{ entityId: "A", name: "Steve Harvey", type: "urn:entity:person", tags: [], affinity: 0.97 }] }];

describe("swap validation", () => {
  it("accepts a pick from the candidate list that appears in the sentence", () => {
    expect(validateRewrite(weak, { picks: [{ referenceId: "r1", entityId: "A" }], rewrittenSentence: "More like Steve Harvey." })).toBeNull();
  });
  it("rejects an entity that Qloo did not offer", () => {
    expect(validateRewrite(weak, { picks: [{ referenceId: "r1", entityId: "INVENTED" }], rewrittenSentence: "More like Steve Harvey." })).toMatch(/pick one/);
  });
  it("rejects a missing pick or a sentence without the chosen name", () => {
    expect(validateRewrite(weak, { picks: [], rewrittenSentence: "x" })).toMatch(/pick one/);
    expect(validateRewrite(weak, { picks: [{ referenceId: "r1", entityId: "A" }], rewrittenSentence: "More like Oprah." })).toMatch(/must contain/);
  });
});
