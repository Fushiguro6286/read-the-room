import { z } from "zod";
import { extractLLM, llmOnlyRewrite, rewriteLLM, type Candidate } from "./llm";
import { createQloo, QlooBudgetError, QlooError, type Qloo } from "./qloo";
import type { QlooEntity } from "./qloo-types";
import { parseRoom, roomParams, RoomError } from "./room";
import { applySwaps, classify, namesMatch, normalizeName, roomScore, splitSentences, THRESHOLDS } from "./score";
import type { ReferenceResult, RoomSignals, RunResult, SnapshotEntry, StepEvent, StepKey } from "./types";

export { RoomError };

const SNAPSHOT_TYPES = ["tv_show", "artist", "movie", "brand"];
// The untyped search fallback may only fix a near-miss type guess, never turn a brand into an album or podcast.
const TYPE_FAMILIES = [["person", "artist"], ["movie", "tv_show"], ["place", "destination"]].map((f) => f.map((t) => `urn:entity:${t}`));
const sameFamily = (a: string, b: string) => a === b || TYPE_FAMILIES.some((f) => f.includes(a) && f.includes(b));

export interface RunOptions {
  onStep?: (e: StepEvent) => void;
  qloo?: Qloo;
}

/** Find each surface in the text; first non-overlapping occurrence, duplicates dropped. */
export function locateReferences(text: string, surfaces: { surface: string; guessedType: string }[], max: number) {
  const sentences = splitSentences(text);
  const taken: [number, number][] = [];
  const seen = new Set<string>();
  const out: { surface: string; guessedType: string; start: number; end: number; sentenceIndex: number }[] = [];
  for (const r of surfaces) {
    const key = normalizeName(r.surface);
    if (!key || seen.has(key)) continue;
    let from = 0;
    let start = -1;
    while ((start = text.indexOf(r.surface, from)) !== -1) {
      const end = start + r.surface.length;
      if (!taken.some(([a, b]) => start < b && end > a)) break;
      from = start + 1;
    }
    if (start === -1) continue;
    const end = start + r.surface.length;
    seen.add(key);
    taken.push([start, end]);
    const sentenceIndex = Math.max(0, sentences.findIndex((s) => start >= s.start && start < s.end));
    out.push({ ...r, start, end, sentenceIndex });
    if (out.length >= max) break;
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Exact name first, then the first close match. */
export function pickMatch(surface: string, results: QlooEntity[]): QlooEntity | undefined {
  const n = normalizeName(surface);
  return results.find((e) => normalizeName(e.name) === n) ?? results.find((e) => namesMatch(surface, e.name));
}

/** Tags that define what something IS come first: genre, then subgenre, then keywords; broad wikidata categories last. */
const TAG_PRIORITY = ["urn:tag:genre", "urn:tag:subgenre", "urn:tag:keyword", "urn:tag:brand_type", "urn:tag:theme"];
export function topTags<T extends { id: string; type?: string }>(tags: T[]): T[] {
  const rank = (t: T) => {
    const i = TAG_PRIORITY.findIndex((p) => t.type?.startsWith(p));
    return t.type?.startsWith("urn:tag:category") ? 99 : i === -1 ? TAG_PRIORITY.length : i;
  };
  return tags
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .map((x) => x.t)
    .filter((t, i, all) => all.findIndex((u) => u.id === t.id) === i)
    .slice(0, 3);
}

export async function runAgent(input: { text: string; room: string }, opts: RunOptions = {}): Promise<RunResult> {
  const qloo = opts.qloo ?? createQloo();
  const maxRefs = Number(process.env.MAX_REFERENCES_PER_TEXT || 8);
  const maxRounds = Number(process.env.MAX_ROUNDS || 3);
  const steps: StepEvent[] = [];
  const notes: string[] = [];
  const step = (key: StepKey, status: StepEvent["status"], detail: string) => {
    const e: StepEvent = { type: "step", key, status, detail, qlooCalls: qloo.calls };
    steps.push(e);
    opts.onStep?.(e);
  };
  const text = input.text;

  // Qloo-off baseline runs alongside everything else.
  const llmOnlyP = llmOnlyRewrite(text, input.room).catch(() => "");

  // 1. Room
  step("parse_room", "running", `Reading the room: "${input.room}"`);
  let room: RoomSignals;
  try {
    room = await parseRoom(input.room, qloo);
  } catch (e) {
    step("parse_room", "error", (e as Error).message);
    throw e;
  }
  const signals = roomParams(room);
  step("parse_room", "done", describeRoom(room));
  const snapshotP = snapshot(room, qloo);

  // 2. Extract
  step("extract", "running", "Finding cultural references");
  const extracted = await extractLLM(text, maxRefs);
  const located = locateReferences(text, extracted.references, maxRefs);
  const refs: ReferenceResult[] = located.map((r, i) => ({
    id: `r${i + 1}`,
    surface: r.surface,
    start: r.start,
    end: r.end,
    sentenceIndex: r.sentenceIndex,
    tags: [],
    status: "unknown",
  }));
  step("extract", "done", refs.length ? `Found ${refs.length}: ${refs.map((r) => r.surface).join(", ")}` : "No references found");

  // 3. Resolve
  if (refs.length) {
    step("resolve", "running", "Looking up each reference in Qloo's taste graph");
    await Promise.all(
      refs.map(async (r, i) => {
        const guessed = `urn:entity:${located[i].guessedType}`;
        try {
          let hit = pickMatch(r.surface, await qloo.search(r.surface, guessed, 5));
          if (!hit) {
            // Untyped fallback for near-miss type guesses (e.g. a person guessed as an artist).
            const any = await qloo.search(r.surface, undefined, 5);
            hit = pickMatch(r.surface, any.filter((e) => sameFamily(guessed, e.type)));
          }
          if (hit) Object.assign(r, { entityId: hit.id, entityName: hit.name, entityType: hit.type, tags: hit.tags.map(({ id, name, type }) => ({ id, name, type })) });
        } catch (e) {
          if (!(e instanceof QlooBudgetError)) throw e;
        }
      }),
    );
    const unresolved = refs.filter((r) => !r.entityId).map((r) => r.surface);
    step("resolve", "done", `Resolved ${refs.length - unresolved.length}/${refs.length}${unresolved.length ? ` (no Qloo data: ${unresolved.join(", ")})` : ""}`);

    // 4. Score: one call per entity type
    step("score", "running", "Scoring each reference for this room");
    const byType = groupBy(refs.filter((r) => r.entityId), (r) => r.entityType!);
    await Promise.all(
      [...byType].map(async ([type, list]) => {
        try {
          const got = await qloo.insights({ "filter.type": type, ...signals, "filter.results.entities": list.map((r) => r.entityId).join(","), "feature.explainability": "true" });
          const aff = new Map(got.map((e) => [e.id, e.affinity]));
          for (const r of list) {
            const a = aff.get(r.entityId!);
            if (a !== undefined) r.affinity = a;
            else Object.assign(r, { affinity: THRESHOLDS.omittedAffinity, omitted: true });
          }
        } catch (e) {
          if (e instanceof QlooError && e.status === 400 && /locali|location/i.test(e.message) && room.locationQuery)
            throw new RoomError(`Qloo couldn't find a place called "${room.locationQuery}". Try a nearby city.`);
          if (e instanceof QlooBudgetError) notes.push("Call budget reached while scoring");
          else notes.push(`Qloo couldn't score ${type.split(":").pop()} references for this room`);
        }
      }),
    ).catch((e) => {
      step("score", "error", (e as Error).message);
      throw e;
    });
    for (const r of refs) r.status = classify(r.affinity);
    step("score", "done", refs.map((r) => `${r.surface}: ${r.affinity === undefined ? "no data" : r.omitted ? "not a standout" : r.affinity.toFixed(2)}`).join(" · "));
  }

  // 5–8. Swap loop
  const tried = new Set<string>();
  const swappedSentences = new Set<number>();
  let rounds = 0;
  try {
    while (rounds < maxRounds) {
      const eligible = refs.filter((r) => r.status === "weak" && r.entityId && !r.swap && !tried.has(r.id) && !swappedSentences.has(r.sentenceIndex));
      if (!eligible.length) break;
      rounds++;
      const targetSentences = new Set([...eligible].sort((a, b) => a.affinity! - b.affinity!).slice(0, 3).map((r) => r.sentenceIndex));
      const group = eligible.filter((r) => targetSentences.has(r.sentenceIndex));
      group.forEach((r) => tried.add(r.id));

      step("find_swaps", "running", `Round ${rounds}: asking Qloo for stronger ${group.map((r) => r.surface).join(", ")} alternatives`);
      const cands = new Map<string, Candidate[]>();
      await Promise.all(
        group.map(async (r) => {
          const tags = topTags(r.tags);
          const search = (operator: "union" | "intersection") =>
            qloo.insights({
              "filter.type": r.entityType,
              ...signals,
              "filter.tags": tags.map((t) => t.id).join(",") || undefined,
              "operator.filter.tags": tags.length ? operator : undefined,
              "filter.exclude.entities": r.entityId,
              take: "10",
            });
          const strongCount = (xs: QlooEntity[]) => xs.filter((e) => (e.affinity ?? 0) >= THRESHOLDS.strong).length;
          // Closest match first (all tags); widen to any tag when that's too narrow.
          let got = tags.length > 1 ? await search("intersection") : [];
          if (strongCount(got) < 3) got = [...got, ...(await search("union")).filter((e) => !got.some((g) => g.id === e.id))];
          const list = got
            .filter((e) => (e.affinity ?? 0) >= THRESHOLDS.strong && normalizeName(e.name) !== normalizeName(r.entityName ?? ""))
            .slice(0, 5)
            .map((e) => ({ entityId: e.id, name: e.name, type: e.type || r.entityType!, tags: e.tags.map((t) => t.name), affinity: e.affinity! }));
          if (list.length) cands.set(r.id, list);
        }),
      );
      step("find_swaps", "done", group.map((r) => `${r.surface}: ${cands.get(r.id)?.map((c) => c.name).slice(0, 3).join(", ") || "no stronger fit in Qloo"}`).join(" · "));

      const sentences = splitSentences(text);
      await Promise.all(
        [...targetSentences].map(async (si) => {
          const weak = group.filter((r) => r.sentenceIndex === si && cands.has(r.id));
          if (!weak.length) return;
          const s = sentences[si];
          for (let attempt = 0; attempt < 2 && weak.every((r) => cands.get(r.id)!.length); attempt++) {
            step("rewrite", "running", `Rewriting: "${s.text}"`);
            const rw = await rewriteWithLengthGuard(s.text, room.label, weak.map((r) => ({ referenceId: r.id, surface: r.surface, candidates: cands.get(r.id)! })));
            if (rw.keepOriginal) {
              step("rewrite", "done", `Kept as written: none of Qloo's candidates fit this sentence`);
              break;
            }
            const picks = weak.map((r) => ({ r, c: cands.get(r.id)!.find((c) => c.entityId === rw.picks.find((p) => p.referenceId === r.id)!.entityId)! }));
            step("rewrite", "done", `"${rw.rewrittenSentence}"`);

            step("verify", "running", `Re-scoring ${picks.map((p) => p.c.name).join(", ")} with Qloo`);
            const verified = new Map<string, number>();
            for (const [type, list] of groupBy(picks, (p) => p.r.entityType!)) {
              const got = await qloo.insights({ "filter.type": type, ...signals, "filter.results.entities": list.map((p) => p.c.entityId).join(",") });
              for (const e of got) if (e.affinity !== undefined) verified.set(e.id, e.affinity);
            }
            const failed = picks.filter((p) => (verified.get(p.c.entityId) ?? THRESHOLDS.omittedAffinity) < p.r.affinity! + THRESHOLDS.swapMargin);
            step(
              "verify",
              "done",
              picks
                .map((p) => `${p.r.surface} → ${p.c.name}: ${p.r.omitted ? "not a standout" : p.r.affinity!.toFixed(2)} → ${verified.get(p.c.entityId)?.toFixed(2) ?? "not a standout"} ${failed.includes(p) ? "✗ rejected" : "✓ kept"}`)
                .join(" · "),
            );
            if (!failed.length) {
              for (const { r, c } of picks)
                r.swap = {
                  entityId: c.entityId,
                  entityName: c.name,
                  entityType: c.type,
                  affinity: verified.get(c.entityId)!,
                  sharedTags: c.tags.filter((t) => r.tags.some((o) => o.name.toLowerCase() === t.toLowerCase())).slice(0, 6),
                  originalSentence: s.text,
                  rewrittenSentence: rw.rewrittenSentence,
                  sentenceStart: s.start,
                  sentenceEnd: s.end,
                  lengthDelta: (rw.rewrittenSentence.length - s.text.length) / s.text.length,
                  accepted: true,
                };
              swappedSentences.add(si);
              return;
            }
            for (const p of failed) cands.set(p.r.id, cands.get(p.r.id)!.filter((c) => c.entityId !== p.c.entityId));
          }
          notes.push(`No verified improvement for: ${weak.map((r) => r.surface).join(", ")}`);
        }),
      );
    }
  } catch (e) {
    if (!(e instanceof QlooBudgetError)) throw e;
    notes.push(`Qloo call budget reached (${qloo.budget}); showing the best result so far`);
  }

  const [snap, llmOnlyText] = await Promise.all([snapshotP, llmOnlyP]);
  if (!llmOnlyText) notes.push("LLM-only baseline unavailable");
  const result: RunResult = {
    text,
    room,
    finalText: applySwaps(text, refs),
    llmOnlyText,
    references: refs,
    roomScoreBefore: roomScore(refs, false),
    roomScoreAfter: roomScore(refs, true),
    snapshot: snap,
    qlooCalls: qloo.calls,
    rounds,
    createdAt: new Date().toISOString(),
    notes,
    steps,
  };
  step("done", "done", `Room Score ${result.roomScoreBefore} → ${result.roomScoreAfter} · ${refs.filter((r) => r.swap).length} swap(s)`);
  result.steps = steps;
  return result;
}

/** Length guard (±10%): retry once, then keep the closer attempt. */
async function rewriteWithLengthGuard(sentence: string, room: string, weak: Parameters<typeof rewriteLLM>[2]) {
  const delta = (s: string) => Math.abs(s.length - sentence.length) / sentence.length;
  const first = await rewriteLLM(sentence, room, weak);
  if (first.keepOriginal || delta(first.rewrittenSentence) <= 0.1) return first;
  const second = await rewriteLLM(sentence, room, weak).catch(() => first);
  return delta(second.rewrittenSentence) < delta(first.rewrittenSentence) ? second : first;
}

/** Top 5 per category for the room. Free calls (outside the run budget), cached 7 days. */
async function snapshot(room: RoomSignals, qloo: Qloo): Promise<Record<string, SnapshotEntry[]>> {
  const out: Record<string, SnapshotEntry[]> = {};
  await Promise.all(
    SNAPSHOT_TYPES.map(async (t) => {
      try {
        const got = await qloo.insights({ "filter.type": `urn:entity:${t}`, ...roomParams(room), take: "5" }, true);
        out[t] = got.filter((e) => e.affinity !== undefined).map((e) => ({ entityId: e.id, name: e.name, affinity: e.affinity! }));
      } catch {
        out[t] = [];
      }
    }),
  );
  return out;
}

function describeRoom(r: RoomSignals): string {
  const parts = [r.locationQuery && `place: ${r.locationQuery}`, r.ageBucket && `ages: ${r.ageBucket.replaceAll("_", " ")}`, r.gender && `gender: ${r.gender}`, r.fanNames?.length && `fans of: ${r.fanNames.join(", ")}`];
  return parts.filter(Boolean).join(" · ");
}

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
}

// ---------- API input and errors (shared by /api/run and /api/v1/rewrite) ----------

export const RunInputSchema = z.object({
  text: z.string().trim().min(10, "Paste at least a sentence.").max(2500, "Keep it under 2,500 characters."),
  room: z.string().trim().min(2, "Describe the room.").max(200),
  roomB: z.string().trim().min(2).max(200).optional(),
  suggest: z.boolean().optional(),
});

/** A message that is safe and useful to show the user. */
export function publicError(e: unknown): string {
  if (e instanceof RoomError) return e.message;
  if (e instanceof QlooError) return "Qloo didn't answer as expected. Please try again, or open an example.";
  return "Something went wrong while reading the room. Please try again, or open an example.";
}
