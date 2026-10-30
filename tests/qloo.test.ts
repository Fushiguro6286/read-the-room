import { describe, expect, it, vi } from "vitest";
import { createQloo, queryString, QlooBudgetError } from "@/lib/qloo";

process.env.QLOO_API_KEY = "test-key";

// Hand-written fixtures in the live shapes (Qloo terms: no raw responses in the repo).
const searchBody = {
  results: [{ entity_id: "E1", name: "Friends", types: ["urn:entity:tv_show"], tags: [{ tag_id: "t1", name: "Sitcom" }] }],
};
const insightsBody = {
  success: true,
  results: { entities: [{ entity_id: "E1", name: "Friends", type: "urn:entity", subtype: "urn:entity:tv_show", tags: [{ id: "t1", name: "Sitcom" }], query: { affinity: 0.83 } }] },
};
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("qloo client", () => {
  it("normalizes /search and /insights shapes the same way", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok(searchBody)).mockResolvedValueOnce(ok(insightsBody));
    const q = createQloo({ fetchImpl: f });
    const [s] = await q.search("Friends-norm", "urn:entity:tv_show");
    const [i] = await q.insights({ "filter.type": "urn:entity:tv_show", "x-norm": "1" });
    expect(s).toMatchObject({ id: "E1", type: "urn:entity:tv_show", tags: [{ id: "t1", name: "Sitcom" }] });
    expect(i).toMatchObject({ id: "E1", type: "urn:entity:tv_show", tags: [{ id: "t1" }], affinity: 0.83 });
    expect(f.mock.calls[0][1].headers["X-Api-Key"]).toBe("test-key");
  });

  it("caches by sorted query string and only counts live calls", async () => {
    const f = vi.fn().mockImplementation(async () => ok(insightsBody));
    const q = createQloo({ fetchImpl: f });
    await q.insights({ b: "2", a: "1-cache" });
    await q.insights({ a: "1-cache", b: "2" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(q.calls).toBe(1);
  });

  it("stops at the budget, but free calls are not counted", async () => {
    const f = vi.fn().mockImplementation(async () => ok(insightsBody));
    const q = createQloo({ fetchImpl: f, budget: 1 });
    await q.insights({ k: "budget-1" });
    await expect(q.insights({ k: "budget-2" })).rejects.toBeInstanceOf(QlooBudgetError);
    await q.insights({ k: "budget-free" }, true);
    expect(q.calls).toBe(1);
  });

  it("retries once on a 5xx, and surfaces a 4xx without retry", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response("boom", { status: 502 }))
      .mockResolvedValueOnce(ok(insightsBody))
      .mockResolvedValueOnce(new Response("no locality", { status: 400 }));
    const q = createQloo({ fetchImpl: f });
    expect(await q.insights({ k: "retry" })).toHaveLength(1);
    await expect(q.insights({ k: "bad" })).rejects.toThrow(/400/);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("drops empty params from the query string", () => {
    expect(queryString({ z: "1", a: undefined, m: "" })).toBe("z=1");
  });
});
