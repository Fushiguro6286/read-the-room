import { z } from "zod";
import { cacheGet, cacheSet } from "@/lib/cache";
import { allowLiveRun, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";
import { runTour, type TourRoom } from "@/lib/tour";

export const maxDuration = 60;

const Input = z.object({
  references: z
    .array(
      z.object({
        id: z.string().regex(/^\w{1,10}$/),
        entityId: z.string().regex(/^[\w-]{1,100}$/),
        entityType: z.string().regex(/^urn:entity:[a-z_]{1,30}$/),
      }),
    )
    .min(1)
    .max(8),
});

/** Scores the given resolved references for each preset audience. Cached, so demo tours load instantly after the first. */
export async function POST(req: Request) {
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid references" }, { status: 400 });
  const refs = parsed.data.references;
  const key = `tour:v2:${refs.map((r) => `${r.id}=${r.entityId}`).sort().join(",")}`;
  const hit = await cacheGet<TourRoom[]>(key);
  if (hit) return Response.json({ rooms: hit });
  if (!(await allowLiveRun(req))) return Response.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  try {
    const rooms = await runTour(refs);
    if (rooms.some((r) => r.score !== null)) await cacheSet(key, rooms, 7 * 86400);
    return Response.json({ rooms });
  } catch (e) {
    console.error("tour failed:", e);
    return Response.json({ error: "Couldn't reach Qloo. Try again." }, { status: 502 });
  }
}
