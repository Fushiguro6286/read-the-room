"use client";
import { segments } from "@/lib/score";
import type { ReferenceResult } from "@/lib/types";
import { affinityText, STATUS } from "./ui";

/** Text with each reference underlined by status; Qloo swaps shown in green with a "swapped" marker. */
export function HighlightedText({
  text,
  refs,
  useSwaps,
  onSelect,
  hintRefId,
}: {
  text: string;
  refs: ReferenceResult[];
  useSwaps: boolean;
  onSelect?: (r: ReferenceResult) => void;
  hintRefId?: string;
}) {
  return (
    <p className="whitespace-pre-wrap text-[17px] leading-[1.9] sm:text-lg">
      {segments(text, refs, useSwaps).map((s, i) => {
        if (!s.ref) return <span key={i}>{s.text}</span>;
        const status = s.swapped ? "strong" : s.ref.status;
        const st = STATUS[status];
        const title = s.swapped
          ? `Swapped in by Qloo: affinity ${s.ref.swap!.affinity.toFixed(2)} (was "${s.ref.surface}"). Click for why.`
          : `${st.label}: ${affinityText(s.ref)}`;
        return (
          <button
            key={i}
            type="button"
            title={title}
            aria-label={`${s.text}: ${title}`}
            onClick={() => onSelect?.(s.ref!)}
            className={`relative rounded-sm px-0.5 underline underline-offset-[5px] decoration-[3px] ${st.deco} ${status === "unknown" ? "decoration-dotted" : ""} ${
              s.swapped ? "bg-strong/10 font-semibold" : status === "weak" ? "bg-weak/5" : ""
            } ${hintRefId === s.ref.id && s.swapped ? "pulse-hint" : ""} cursor-pointer hover:bg-spot/15 text-left`}
          >
            {s.text}
            <sup className={`ml-0.5 text-[10px] font-bold no-underline ${st.text}`} aria-hidden>
              {s.swapped ? "swapped" : st.icon}
            </sup>
          </button>
        );
      })}
    </p>
  );
}
