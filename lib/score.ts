// Pure helpers shared by the server and the browser (no server imports here).
import type { ReferenceResult, Status, Suggestion } from "./types";

/** Calibrated from live Qloo data in M0 (see docs/qloo-notes.md). */
export const THRESHOLDS = {
  strong: 0.9,
  ok: 0.8,
  omittedAffinity: 0.05, // resolved but left out of the room's results
  swapMargin: 0.1, // a swap must beat the original by this much
};

export function classify(affinity: number | undefined): Status {
  if (affinity === undefined) return "unknown";
  if (affinity >= THRESHOLDS.strong) return "strong";
  if (affinity >= THRESHOLDS.ok) return "ok";
  return "weak";
}

export function effectiveAffinity(r: ReferenceResult, after: boolean): number | undefined {
  return after && r.swap?.accepted ? r.swap.affinity : r.affinity;
}

/** round(100 × mean affinity of known references). Unknowns are excluded; 0 when nothing is known. */
export function roomScore(refs: ReferenceResult[], after: boolean): number {
  const known = refs.map((r) => effectiveAffinity(r, after)).filter((a): a is number => a !== undefined);
  return known.length ? Math.round((100 * known.reduce((s, a) => s + a, 0)) / known.length) : 0;
}

/** Rebuild the text from the original plus accepted swaps (sentence-level, so no API call is needed). */
export function applySwaps(text: string, refs: ReferenceResult[], suggestions: Suggestion[] = []): string {
  const bySentence = new Map<number, { sentenceStart: number; sentenceEnd: number; rewrittenSentence: string }>();
  for (const r of refs) if (r.swap?.accepted) bySentence.set(r.swap.sentenceStart, r.swap);
  for (const s of suggestions) if (s.accepted) bySentence.set(s.sentenceStart, { ...s, rewrittenSentence: s.suggestedSentence });
  let out = text;
  for (const s of [...bySentence.values()].sort((a, b) => b.sentenceStart - a.sentenceStart))
    out = out.slice(0, s.sentenceStart) + s.rewrittenSentence + out.slice(s.sentenceEnd);
  return out;
}

/** Keep/Revert toggles every swap in the same sentence together (they share one rewrite). */
export function toggleSwap(refs: ReferenceResult[], sentenceStart: number, accepted: boolean): ReferenceResult[] {
  return refs.map((r) => (r.swap?.sentenceStart === sentenceStart ? { ...r, swap: { ...r.swap, accepted } } : r));
}

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** 1 - Levenshtein distance / longer length, on normalized names. */
export function similarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x.length && !y.length) return 1;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length);
}

/** Close enough to trust: similar spelling, or one name appears as whole words in the other ("Oprah" ⊂ "Oprah Winfrey"). */
export function namesMatch(surface: string, entityName: string): boolean {
  if (similarity(surface, entityName) >= 0.8) return true;
  const a = ` ${normalizeName(surface)} `;
  const b = ` ${normalizeName(entityName)} `;
  return b.trim().length > 2 && a.trim().length > 2 && (a.includes(b) || b.includes(a));
}

/** Sentence spans with offsets into the original text. */
export function splitSentences(text: string): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  const push = (from: number, to: number) => {
    const raw = text.slice(from, to);
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (body) out.push({ start: from + lead, end: from + lead + body.length, text: body });
  };
  let from = 0;
  for (const m of text.matchAll(/[.!?…]+["'”’)\]]*(?=\s|$)/g)) {
    if (/^(\.{2,}|…)/.test(m[0])) continue; // ellipsis: "so... like X?" stays one sentence
    push(from, m.index! + m[0].length);
    from = m.index! + m[0].length;
  }
  push(from, text.length);
  return out;
}

export interface Segment {
  text: string;
  ref?: ReferenceResult;
  swapped?: boolean; // this piece is a Qloo-chosen replacement
  suggested?: Suggestion; // this piece is an added reference from the audience snapshot
}

/** Split the (final or original) text into plain pieces and reference pieces for highlighting. */
export function segments(text: string, refs: ReferenceResult[], useSwaps: boolean, suggestions: Suggestion[] = []): Segment[] {
  type Span = { start: number; end: number; ref?: ReferenceResult; swapRefs?: ReferenceResult[]; rewritten?: string; suggestion?: Suggestion };
  const swapped = new Map<number, Span>();
  if (useSwaps)
    for (const r of refs)
      if (r.swap?.accepted) {
        const s = swapped.get(r.swap.sentenceStart) ?? { start: r.swap.sentenceStart, end: r.swap.sentenceEnd, swapRefs: [], rewritten: r.swap.rewrittenSentence };
        s.swapRefs!.push(r);
        swapped.set(r.swap.sentenceStart, s);
      }
  if (useSwaps)
    for (const sg of suggestions)
      if (sg.accepted && !swapped.has(sg.sentenceStart))
        swapped.set(sg.sentenceStart, { start: sg.sentenceStart, end: sg.sentenceEnd, swapRefs: [], rewritten: sg.suggestedSentence, suggestion: sg });
  const inSwapped = (pos: number) => [...swapped.values()].some((s) => pos >= s.start && pos < s.end);
  const spans: Span[] = [...swapped.values(), ...refs.filter((r) => !inSwapped(r.start)).map((r) => ({ start: r.start, end: r.end, ref: r }))].sort((a, b) => a.start - b.start);

  const out: Segment[] = [];
  let pos = 0;
  for (const s of spans) {
    if (s.start < pos) continue;
    if (s.start > pos) out.push({ text: text.slice(pos, s.start) });
    if (s.ref) out.push({ text: text.slice(s.start, s.end), ref: s.ref });
    else {
      // Highlight each new name inside the rewritten sentence.
      const sent = s.rewritten!;
      const marks: { r?: ReferenceResult; i: number; n: number }[] = s.swapRefs!.map((r) => ({ r, i: sent.toLowerCase().indexOf(r.swap!.entityName.toLowerCase()), n: r.swap!.entityName.length }));
      if (s.suggestion) marks.push({ i: sent.toLowerCase().indexOf(s.suggestion.name.toLowerCase()), n: s.suggestion.name.length });
      marks.sort((a, b) => a.i - b.i);
      let p = 0;
      for (const m of marks) {
        if (m.i < 0 || m.i < p) continue;
        if (m.i > p) out.push({ text: sent.slice(p, m.i) });
        out.push(m.r ? { text: sent.slice(m.i, m.i + m.n), ref: m.r, swapped: true } : { text: sent.slice(m.i, m.i + m.n), suggested: s.suggestion });
        p = m.i + m.n;
      }
      if (p < sent.length) out.push({ text: sent.slice(p) });
    }
    pos = s.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}
