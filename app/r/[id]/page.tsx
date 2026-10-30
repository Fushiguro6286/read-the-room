import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedView } from "@/components/SharedView";
import { loadShare } from "@/lib/share";

export async function generateMetadata({ params }: PageProps<"/r/[id]">): Promise<Metadata> {
  const { id } = await params;
  const run = await loadShare(id);
  if (!run) return { title: "Result not found · Read the Room" };
  const title = `Room Score ${run.a.roomScoreBefore} → ${run.a.roomScoreAfter} for ${run.a.room.label} · Read the Room`;
  return { title, openGraph: { title, description: "Cultural references re-tuned for this audience with Qloo's taste graph." } };
}

export default async function SharedPage({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const run = await loadShare(id);
  if (!run) notFound();
  return <SharedView run={run} />;
}
