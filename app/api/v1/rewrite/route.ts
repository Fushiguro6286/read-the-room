import { publicError, runAgent, RunInputSchema } from "@/lib/agent";
import { allowLiveRun, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";

export const maxDuration = 120;

/** Public JSON API: { text, room } -> RunResult. */
export async function POST(req: Request) {
  const parsed = RunInputSchema.omit({ roomB: true }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  if (!(await allowLiveRun(req))) return Response.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  try {
    const { steps, ...result } = await runAgent(parsed.data);
    void steps;
    return Response.json(result);
  } catch (e) {
    console.error("v1/rewrite failed:", e);
    return Response.json({ error: publicError(e) }, { status: 502 });
  }
}
