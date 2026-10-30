import { saveShare, SharedRunSchema, type SharedRun } from "@/lib/share";

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 300_000) return Response.json({ error: "Result too large to share" }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {}
  const parsed = SharedRunSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid result" }, { status: 400 });
  const id = await saveShare(parsed.data as unknown as SharedRun);
  const base = process.env.APP_URL || new URL(req.url).origin;
  return Response.json({ id, url: `${base}/r/${id}` });
}
