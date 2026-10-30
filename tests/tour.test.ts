import { describe, expect, it, vi } from "vitest";
import { createQloo } from "@/lib/qloo";
import { runTour, TOUR_ROOMS } from "@/lib/tour";

process.env.QLOO_API_KEY = "test-key";

const entity = (id: string, affinity: number) => ({ entity_id: id, name: id, subtype: "urn:entity:tv_show", tags: [], query: { affinity } });
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("tour", () => {
  it("scores every room, marks omitted refs low and failed calls as no data", async () => {
    const f = vi.fn().mockImplementation(async (url: string) => {
      const u = new URL(url);
      const age = u.searchParams.get("signal.demographics.age");
      if (u.searchParams.get("filter.type") === "urn:entity:brand") return new Response("bad", { status: 400 });
      // 55+ leaves T2 out of its results.
      return ok({ results: { entities: age === "55_and_older" ? [entity("tour-T1", 0.9)] : [entity("tour-T1", 0.9), entity("tour-T2", 0.7)] } });
    });
    const rooms = await runTour(
      [
        { id: "r1", entityId: "tour-T1", entityType: "urn:entity:tv_show" },
        { id: "r2", entityId: "tour-T2", entityType: "urn:entity:tv_show" },
        { id: "r3", entityId: "tour-B1", entityType: "urn:entity:brand" },
      ],
      createQloo({ fetchImpl: f, budget: 40 }),
    );
    expect(rooms.map((r) => r.label)).toEqual(TOUR_ROOMS.map((r) => r.label));
    const young = rooms[0];
    expect(young.cells).toEqual({ r1: { affinity: 0.9 }, r2: { affinity: 0.7 } }); // r3 failed: no cell = no data
    expect(young.score).toBe(80);
    const old = rooms.find((r) => r.label === "Ages 55+")!;
    expect(old.cells.r2).toEqual({ affinity: 0.05, omitted: true });
    expect(old.score).toBe(48);
  });
});
