"use client";
import { useEffect, useRef, useState } from "react";
import { QlooTag } from "./ui";

const STEPS: [string, string, boolean][] = [
  ["Find references", "The LLM finds every TV show, artist, brand, celebrity and place in your text.", false],
  ["Look up", "Each reference is resolved to an entity in Qloo's taste graph (/search).", true],
  ["Score", "Qloo scores how strongly each one lands with this room (/v2/insights, one call per type).", true],
  ["Find swaps", "For weak ones, Qloo returns same-type entities that share tags and score high for the room.", true],
  ["Rewrite", "The LLM picks one of Qloo's candidates and rewrites only that sentence, keeping length and tone.", false],
  ["Verify", "Qloo re-scores the new reference. A swap is kept only if it beats the original.", true],
];

const TABLE: [string, string][] = [
  ["Which references exist in the taste graph", "Finding references in the text"],
  ["How strongly each lands with the room", "Parsing the room description"],
  ["Which replacements fit (same type + shared tags)", "Choosing among Qloo's candidates for the sentence"],
  ["Whether a rewrite actually improved", "Writing the new sentence"],
];

export function HowItWorks() {
  const [open, setOpen] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="hover:text-spot">
        How Qloo powers this
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="How Qloo powers this" onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-paper p-6 text-ink sm:rounded-2xl">
            <div className="flex items-start justify-between">
              <h2 className="font-display text-3xl uppercase">How Qloo powers this</h2>
              <button ref={close} type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-2xl leading-none text-ink-soft">
                ×
              </button>
            </div>
            <ol className="mt-4 space-y-3">
              {STEPS.map(([t, d, q], i) => (
                <li key={t} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-stage font-bold text-spot">{i + 1}</span>
                  <div>
                    <div className="flex items-center gap-2 font-semibold">
                      {t} {q ? <QlooTag /> : <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">LLM</span>}
                    </div>
                    <p className="text-sm text-ink-soft">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
            <table className="mt-6 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-rule">
                  <th className="py-2 pr-3">Qloo decides</th>
                  <th className="py-2">The LLM writes</th>
                </tr>
              </thead>
              <tbody>
                {TABLE.map(([q, l]) => (
                  <tr key={q} className="border-b border-rule/60 align-top">
                    <td className="py-2 pr-3">{q}</td>
                    <td className="py-2 text-ink-soft">{l}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-sm text-ink-soft">The LLM never invents an affinity number and can only choose replacements from Qloo&apos;s list. If Qloo has no data, the reference is marked &ldquo;no data&rdquo; and left out of the score.</p>
          </div>
        </div>
      )}
    </>
  );
}
