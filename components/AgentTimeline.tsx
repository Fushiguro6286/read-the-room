"use client";
import { useState } from "react";
import type { StepEvent, StepKey } from "@/lib/types";
import { QlooTag } from "./ui";

const META: Record<StepKey, { label: string; icon: string; qloo: boolean }> = {
  parse_room: { label: "Read the room", icon: "◎", qloo: false },
  extract: { label: "Find references", icon: "✎", qloo: false },
  resolve: { label: "Look up in Qloo", icon: "⌕", qloo: true },
  score: { label: "Score for this room", icon: "▤", qloo: true },
  find_swaps: { label: "Find stronger swaps", icon: "⇄", qloo: true },
  rewrite: { label: "Rewrite the line", icon: "✍", qloo: false },
  verify: { label: "Verify with Qloo", icon: "✓", qloo: true },
  done: { label: "Done", icon: "★", qloo: false },
};

/** Live agent steps with a Qloo call counter. Collapsible once finished. */
export function AgentTimeline({ steps, budget = 20, running, dark }: { steps: StepEvent[]; budget?: number; running?: boolean; dark?: boolean }) {
  const [open, setOpen] = useState(true);
  // Show finished steps, plus the step currently running.
  const shown = steps.filter((s, i) => s.status !== "running" || (running && i === steps.length - 1));
  const calls = steps.at(-1)?.qlooCalls ?? 0;
  return (
    <div className={`rounded-2xl border p-4 ${dark ? "border-stage-line bg-stage-2 text-[#f3efe8]" : "border-rule bg-paper text-ink"}`}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={open}>
        <span className="font-display text-lg uppercase tracking-wide">Agent steps</span>
        <span className="flex items-center gap-3 text-sm">
          <span className="tabular-nums">
            <QlooTag /> calls: <b>{calls}</b>/{budget}
          </span>
          <span aria-hidden>{open ? "▾" : "▸"}</span>
        </span>
      </button>
      {open && (
        <ol className="mt-3 space-y-2">
          {shown.map((s, i) => {
            const m = META[s.key];
            return (
              <li key={i} className="flex gap-3 text-sm">
                <span
                  aria-hidden
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${
                    s.status === "error" ? "bg-weak text-white" : s.status === "running" ? "animate-pulse bg-spot text-stage" : "bg-spot/20 text-spot"
                  }`}
                >
                  {m.icon}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-semibold">
                    {m.label} {m.qloo && <QlooTag />}
                    {s.status === "running" && <span className="text-xs font-normal opacity-70">working…</span>}
                  </div>
                  <div className="break-words opacity-75">{s.detail}</div>
                </div>
              </li>
            );
          })}
          {!shown.length && <li className="text-sm opacity-70">Starting…</li>}
        </ol>
      )}
    </div>
  );
}
