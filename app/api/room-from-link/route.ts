import { createHash } from "node:crypto";
import { z } from "zod";
import { cacheIncr } from "@/lib/cache";
import { fetchReadable, LinkError, proposeRoom } from "@/lib/linkroom";
import { clientIp, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";

const Input = z.object({ url: z.string().max(2000).optional(), description: z.string().max(3000).optional() }).refine((v) => v.url?.trim() || v.description?.trim(), "Paste an event link or a description.");

export async function POST(req: Request) {
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const ip = createHash("sha256").update(clientIp(req)).digest("hex").slice(0, 16);
  if ((await cacheIncr(`rl:link:${ip}:${new Date().toISOString().slice(0, 13)}`, 3600)) > 20) return Response.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  try {
    const { url, description } = parsed.data;
    const source = url?.trim() ? await fetchReadable(url) : description!.trim();
    return Response.json(await proposeRoom(source));
  } catch (e) {
    if (e instanceof LinkError) return Response.json({ error: e.message }, { status: 400 });
    console.error("room-from-link failed:", e);
    return Response.json({ error: "Couldn't read that event. Try pasting a description instead." }, { status: 502 });
  }
}
