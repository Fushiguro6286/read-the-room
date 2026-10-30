"use client";
import { useEffect, useState } from "react";
import { applySwaps, roomScore, toggleSwap } from "@/lib/score";
import type { ReferenceResult, RunResult, Suggestion } from "@/lib/types";
import { HighlightedText } from "./HighlightedText";
import { RoomScore } from "./RoomScore";
import { SwapPopover } from "./SwapPopover";
import { AffinityBar, Panel, QlooTag, StatusBadge } from "./ui";

const HINT_KEY = "rtr-hint-seen";

/** One room's result. Keep/Revert recomputes text and score on the client (no network). */
export function ResultView({ result, onChange, compact, readOnly }: { result: RunResult; onChange?: (r: RunResult) => void; compact?: boolean; readOnly?: boolean }) {
  const [tab, setTab] = useState<"qloo" | "llm">("qloo");
  const [selected, setSelected] = useState<ReferenceResult | null>(null);
  const [hint, setHint] = useState(false);
  const refs = result.references;
  const known = refs.some((r) => r.affinity !== undefined);
  const firstSwap = refs.find((r) => r.swap?.accepted);

  useEffect(() => {
    if (compact || readOnly || !firstSwap) return;
    try {
      if (!localStorage.getItem(HINT_KEY)) setHint(true); // eslint-disable-line react-hooks/set-state-in-effect
    } catch {}
  }, [compact, readOnly, firstSwap]);

  const select = (r: ReferenceResult) => {
    setSelected(r);
    if (hint) {
      setHint(false);
      try {
        localStorage.setItem(HINT_KEY, "1");
      } catch {}
    }
  };

  const setAccepted = (sentenceStart: number, accepted: boolean) => {
    const next = toggleSwap(refs, sentenceStart, accepted);
    onChange?.({ ...result, references: next, finalText: applySwaps(result.text, next, result.suggestions), roomScoreAfter: roomScore(next, true) });
  };

  const setSuggestion = (sentenceStart: number, accepted: boolean) => {
    const suggestions = result.suggestions?.map((s) => (s.sentenceStart === sentenceStart ? { ...s, accepted } : s));
    onChange?.({ ...result, suggestions, finalText: applySwaps(result.text, refs, suggestions) });
  };

  const finalText = applySwaps(result.text, refs, result.suggestions);

  return (
    <div className={compact ? "space-y-4" : "grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]"}>
      <div className="space-y-4 min-w-0">
        <Panel>
          <div role="tablist" aria-label="Version" className="mb-4 inline-flex rounded-full bg-rule p-1 text-sm font-semibold">
            {(["qloo", "llm"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full px-4 py-1.5 ${tab === t ? "bg-stage text-spot shadow" : "text-ink-soft hover:text-ink"}`}
              >
                {t === "qloo" ? "Qloo-grounded" : "LLM only"}
              </button>
            ))}
          </div>
          {tab === "qloo" ? (
            <>
              <div className="relative">
                {hint && firstSwap && (
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-spot px-3 py-1 text-xs font-bold text-stage" role="status">
                    <span aria-hidden>↓</span> Click &ldquo;{firstSwap.swap!.entityName}&rdquo; to see why Qloo picked it
                  </div>
                )}
                <HighlightedText text={result.text} refs={refs} useSwaps onSelect={select} hintRefId={hint ? firstSwap?.id : undefined} suggestions={result.suggestions} />
              </div>
              {!!result.suggestions?.length && (
                <div className="mt-4 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-soft">Suggested additions (from what this room loves)</h3>
                  {result.suggestions.map((s) => (
                    <SuggestionChip key={s.sentenceStart} s={s} onToggle={readOnly ? undefined : (on) => setSuggestion(s.sentenceStart, on)} />
                  ))}
                </div>
              )}
              <Legend />
            </>
          ) : (
            <>
              <div className="mb-3 rounded-lg border border-weak/30 bg-weak/5 px-3 py-2 text-sm text-weak">
                <b>LLM only, no taste data.</b> Written without taste data. Guesses may be stereotypes.
              </div>
              <p className="whitespace-pre-wrap text-[17px] leading-[1.9] sm:text-lg">{result.llmOnlyText || "The LLM-only version isn't available for this run."}</p>
            </>
          )}
          {!readOnly && <ExportButtons text={tab === "qloo" ? finalText : result.llmOnlyText} />}
        </Panel>
        {!compact && <SwapList refs={refs} onToggle={readOnly ? undefined : setAccepted} onSelect={select} />}
      </div>

      <div className="space-y-4 min-w-0">
        <Panel>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">Room: {result.room.label}</p>
          <RoomScore before={result.roomScoreBefore} after={roomScore(refs, true)} known={known} compact={compact} />
          {!!result.notes.length && (
            <ul className="mt-3 space-y-1 text-xs text-ink-soft">
              {result.notes.map((n) => (
                <li key={n}>• {n}</li>
              ))}
            </ul>
          )}
        </Panel>
        {compact && <SwapList refs={refs} onToggle={readOnly ? undefined : setAccepted} onSelect={select} />}
        <AudienceSnapshot snapshot={result.snapshot} />
      </div>
      {selected && <SwapPopover r={refs.find((r) => r.id === selected.id) ?? selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SuggestionChip({ s, onToggle }: { s: Suggestion; onToggle?: (on: boolean) => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-strong/60 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="font-semibold">
          + {s.name} <span className="font-normal text-ink-soft">({s.category}, Qloo affinity {s.affinity.toFixed(2)})</span>
        </div>
        <div className="text-ink-soft">{s.suggestedSentence}</div>
      </div>
      {onToggle && (
        <button type="button" aria-pressed={s.accepted} onClick={() => onToggle(!s.accepted)} className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${s.accepted ? "bg-ink text-paper" : "bg-strong text-white"}`}>
          {s.accepted ? "Remove" : "Add"}
        </button>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-rule pt-3" aria-label="Legend">
      {(["strong", "ok", "weak", "unknown"] as const).map((s) => (
        <StatusBadge key={s} status={s} />
      ))}
      <span className="text-xs text-ink-soft self-center">Click any reference for Qloo&apos;s numbers.</span>
    </div>
  );
}

export function SwapList({ refs, onToggle, onSelect }: { refs: ReferenceResult[]; onToggle?: (sentenceStart: number, accepted: boolean) => void; onSelect: (r: ReferenceResult) => void }) {
  const groups = new Map<number, ReferenceResult[]>();
  for (const r of refs) if (r.swap) groups.set(r.swap.sentenceStart, [...(groups.get(r.swap.sentenceStart) ?? []), r]);
  const unswappedWeak = refs.filter((r) => r.status === "weak" && !r.swap);
  return (
    <Panel title={`Swaps (${[...groups.values()].flat().length})`}>
      {!groups.size && <p className="text-sm text-ink-soft">No swaps needed or none verified. Every swap must score higher in Qloo before it is kept.</p>}
      <ul className="space-y-3">
        {[...groups.entries()].map(([start, list]) => {
          const s = list[0].swap!;
          return (
            <li key={start} className="rounded-xl border border-rule p-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                {list.map((r) => (
                  <button key={r.id} type="button" onClick={() => onSelect(r)} className="hover:underline">
                    <span className="text-weak line-through decoration-1">{r.surface}</span> <span aria-hidden>→</span>{" "}
                    <span className="text-strong">{r.swap!.entityName}</span>{" "}
                    <span className="font-normal text-ink-soft tabular-nums">
                      ({r.omitted ? "below cutoff" : r.affinity!.toFixed(2)} → {r.swap!.affinity.toFixed(2)})
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-sm text-ink-soft line-through decoration-weak/40">{s.originalSentence}</p>
              <p className="mt-1 text-sm">{s.rewrittenSentence}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-ink-soft">
                  length {s.lengthDelta >= 0 ? "+" : ""}
                  {Math.round(s.lengthDelta * 100)}%
                </span>
                {onToggle && (
                  <div className="inline-flex rounded-full bg-rule p-0.5 text-xs font-semibold">
                    <button type="button" aria-pressed={s.accepted} onClick={() => onToggle(start, true)} className={`rounded-full px-3 py-1 ${s.accepted ? "bg-strong text-white" : "text-ink-soft"}`}>
                      Keep
                    </button>
                    <button type="button" aria-pressed={!s.accepted} onClick={() => onToggle(start, false)} className={`rounded-full px-3 py-1 ${!s.accepted ? "bg-ink text-paper" : "text-ink-soft"}`}>
                      Revert
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!!unswappedWeak.length && (
        <p className="mt-3 text-xs text-ink-soft">
          Kept as written (no verified stronger fit in Qloo): {unswappedWeak.map((r) => r.surface).join(", ")}
        </p>
      )}
    </Panel>
  );
}

const SNAP_LABELS: Record<string, string> = { tv_show: "TV", artist: "Music", movie: "Movies", brand: "Brands" };

export function AudienceSnapshot({ snapshot }: { snapshot: RunResult["snapshot"] }) {
  const cats = Object.keys(SNAP_LABELS).filter((k) => snapshot[k]?.length);
  return (
    <Panel title="What this room loves" action={<QlooTag />}>
      {!cats.length && <p className="text-sm text-ink-soft">Qloo returned no audience snapshot for this room.</p>}
      <div className="space-y-4">
        {cats.map((k) => (
          <div key={k}>
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-ink-soft">{SNAP_LABELS[k]}</h3>
            <div className="space-y-1.5">
              {snapshot[k].map((e) => (
                <AffinityBar key={e.entityId} label={e.name} value={e.affinity} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ExportButtons({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        className="rounded-full border border-rule px-3 py-1.5 text-sm font-semibold hover:bg-rule"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {}
        }}
      >
        {copied ? "Copied ✓" : "Copy text"}
      </button>
      <button
        type="button"
        className="rounded-full border border-rule px-3 py-1.5 text-sm font-semibold hover:bg-rule"
        onClick={() => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
          a.download = "read-the-room.txt";
          a.click();
          URL.revokeObjectURL(a.href);
        }}
      >
        Download .txt
      </button>
    </div>
  );
}
