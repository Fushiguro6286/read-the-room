// "Who it lands with": score a text's already-resolved references for each age group and gender. Qloo only, no LLM.
// No city on purpose: with a location, Qloo drops entities that aren't local standouts, so global names all read "low".
import { createQloo, QlooBudgetError, QlooError, type Qloo } from "./qloo";
import { roomParams } from "./room";
import { THRESHOLDS } from "./score";
import type { RoomSignals } from "./types";

export const TOUR_ROOMS: RoomSignals[] = [
  { label: "Ages 18–24", ageBucket: "24_and_younger" },
  { label: "Ages 25–34", ageBucket: "25_to_29,30_to_34" },
  { label: "Ages 35–44", ageBucket: "35_to_44" },
  { label: "Ages 45–54", ageBucket: "45_to_54" },
  { label: "Ages 55+", ageBucket: "55_and_older" },
  { label: "Women", gender: "female" },
  { label: "Men", gender: "male" },
];

export interface TourRef {
  id: string;
  entityId: string;
  entityType: string;
}
export interface TourCell {
  affinity?: number; // from Qloo only; missing = no data
  omitted?: boolean;
}
export interface TourRoom {
  label: string;
  cells: Record<string, TourCell>;
  score: number | null; // same formula as Room Score; null when Qloo returned nothing
}

export async function runTour(refs: TourRef[], qloo: Qloo = createQloo({ budget: 40 })): Promise<TourRoom[]> {
  const byType = new Map<string, TourRef[]>();
  for (const r of refs) byType.set(r.entityType, [...(byType.get(r.entityType) ?? []), r]);
  const out: TourRoom[] = [];
  // Rooms one at a time so a burst of parallel calls doesn't trip Qloo's rate limit.
  for (const room of TOUR_ROOMS) {
    const cells: Record<string, TourCell> = {};
    await Promise.all(
      [...byType].map(async ([type, list]) => {
        try {
          // Same params as the agent's score step, so cached responses are shared.
          const got = await qloo.insights({
            "filter.type": type,
            ...roomParams(room),
            "filter.results.entities": list.map((r) => r.entityId).join(","),
            "feature.explainability": "true",
          });
          const aff = new Map(got.map((e) => [e.id, e.affinity]));
          for (const r of list) {
            const a = aff.get(r.entityId);
            cells[r.id] = a !== undefined ? { affinity: a } : { affinity: THRESHOLDS.omittedAffinity, omitted: true };
          }
        } catch (e) {
          if (!(e instanceof QlooBudgetError || e instanceof QlooError)) throw e; // cells stay "no data"
        }
      }),
    );
    const known = Object.values(cells).map((c) => c.affinity!);
    out.push({ label: room.label, cells, score: known.length ? Math.round((100 * known.reduce((s, a) => s + a, 0)) / known.length) : null });
  }
  return out;
}
