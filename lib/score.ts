// Pure helpers shared by the server and the browser (no server imports here).
import type { ReferenceResult, Status } from "./types";

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
export function applySwaps(text: string, refs: ReferenceResult[]): string {
  const bySentence = new Map<number, NonNullable<ReferenceResult["swap"]>>();
  for (const r of refs) if (r.swap?.accepted) bySentence.set(r.swap.sentenceStart, r.swap);
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
  const re = /[^.!?]+(?:[.!?]+["'”’)\]]*|$)/g;
  for (const m of text.matchAll(re)) {
    const lead = m[0].length - m[0].trimStart().length;
    const body = m[0].trim();
    if (body) out.push({ start: m.index! + lead, end: m.index! + lead + body.length, text: body });
  }
  return out;
}
