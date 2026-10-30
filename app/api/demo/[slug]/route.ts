import { loadDemo } from "@/lib/demos";

export async function GET(_req: Request, ctx: RouteContext<"/api/demo/[slug]">) {
  const { slug } = await ctx.params;
  const demo = await loadDemo(slug);
  if (!demo) return Response.json({ error: "Demo not found" }, { status: 404 });
  return Response.json(demo, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } });
}
