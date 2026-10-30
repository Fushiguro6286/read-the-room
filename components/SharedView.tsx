"use client";
import Link from "next/link";
import type { SharedRun } from "@/lib/share";
import { ResultView } from "./ResultView";

/** Read-only share page: before/after, score and swaps. */
export function SharedView({ run }: { run: SharedRun }) {
  return (
    <div className="spotlight min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="font-display text-xl uppercase tracking-widest text-spot">
          Read the Room
        </Link>
        <div className="marquee-dots mt-3" aria-hidden />
        <h1 className="mt-6 font-display text-4xl uppercase">Shared result</h1>
        <p className="mt-1 text-[#d8d1c5]">Original text, re-tuned for the room with Qloo&apos;s taste data. Click any reference for the numbers.</p>
        <details className="mt-4 rounded-xl border border-stage-line bg-stage-2 p-4">
          <summary className="cursor-pointer font-semibold text-spot">Original text</summary>
          <p className="mt-2 whitespace-pre-wrap text-[#d8d1c5]">{run.a.text}</p>
        </details>
        <div className={`mt-6 grid gap-6 ${run.b ? "lg:grid-cols-2" : ""}`}>
          {[run.a, run.b].filter((r) => !!r).map((r) => (
            <div key={r.room.label} className="min-w-0">
              <h2 className="mb-3 font-display text-2xl uppercase text-spot">{r.room.label}</h2>
              <ResultView result={r} readOnly compact={!!run.b} />
            </div>
          ))}
        </div>
        <Link href="/" className="mt-8 inline-block rounded-full bg-spot px-5 py-2.5 font-semibold text-stage">
          Read your own room →
        </Link>
      </div>
    </div>
  );
}
