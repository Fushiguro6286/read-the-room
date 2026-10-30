import { publicError, runAgent, RunInputSchema } from "@/lib/agent";
import { allowLiveRun, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";

export const maxDuration = 120;

/** Streams NDJSON: step events (tagged with lane "a" or "b"), then one result per lane, then "end". */
export async function POST(req: Request) {
  const parsed = RunInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  if (!(await allowLiveRun(req))) return Response.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });

  const { text, room, roomB, suggest } = parsed.data;
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      const lane = async (id: "a" | "b", r: string) => {
        try {
          const data = await runAgent({ text, room: r, suggest }, { onStep: (e) => send({ ...e, lane: id }) });
          send({ type: "result", lane: id, data });
        } catch (e) {
          console.error(`run lane ${id} failed:`, e);
          send({ type: "error", lane: id, message: publicError(e) });
        }
      };
      await Promise.all([lane("a", room), roomB ? lane("b", roomB) : null]);
      send({ type: "end" });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
