import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// The only file that talks to the LLM provider; swap the provider here.
let client: Anthropic | undefined;
const llm = () => (client ??= new Anthropic());
const model = () => process.env.LLM_MODEL || "claude-sonnet-5-5";

type Effort = "low" | "medium" | "high";

/**
 * Structured JSON call. Validates with zod (plus an optional semantic check) and
 * retries once with the error in the prompt.
 */
export async function llmJson<S extends z.ZodType>(
  schema: S,
  system: string,
  user: string,
  opts: { effort?: Effort; check?: (v: z.infer<S>) => string | null } = {},
): Promise<z.infer<S>> {
  let prompt = user;
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await llm().messages.parse({
      model: model(),
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: { format: zodOutputFormat(schema), effort: opts.effort ?? "low" },
    });
    if (res.stop_reason === "refusal") throw new Error("The model declined this text.");
    const parsed = schema.safeParse(res.parsed_output);
    lastErr = parsed.success ? (opts.check?.(parsed.data) ?? "") : parsed.error.message;
    if (!lastErr) return parsed.data as z.infer<S>;
    prompt = `${user}\n\nYour previous answer was invalid: ${lastErr}\nFix it and answer again.`;
  }
  throw new Error(`LLM output failed validation: ${lastErr}`);
}

// ---------- Prompts ----------

export const RoomSchema = z.object({
  city: z.string().nullable().describe("City or locality name, or null"),
  ageMin: z.number().int().nullable(),
  ageMax: z.number().int().nullable(),
  gender: z.enum(["male", "female"]).nullable(),
  fanNames: z.array(z.string()).describe("Named things the audience are fans of (artists, shows, brands...)"),
});

export function parseRoomLLM(room: string) {
  return llmJson(
    RoomSchema,
    "You turn a short audience description into structured signals. Only use what is stated; use null when not stated. " +
      'An age like "55 and over" means ageMin 55, ageMax null. "Gen Z" means 18-27, "millennials" 29-44, "boomers" 60-78.',
    `Audience: ${room}`,
  );
}

export const TYPE_NAMES = ["artist", "movie", "tv_show", "brand", "person", "place", "book", "podcast", "videogame", "destination"] as const;

export const ExtractSchema = z.object({
  references: z.array(
    z.object({
      surface: z.string().describe("Exact substring copied from the text"),
      guessedType: z.enum(TYPE_NAMES),
    }),
  ),
});

export function extractLLM(text: string, max: number) {
  return llmJson(
    ExtractSchema,
    "You find cultural references in text: TV shows, movies, musicians, brands and products, celebrities and public figures, " +
      "books, podcasts, video games, and famous places. Copy each one exactly as written (same spelling and case). " +
      "Skip generic words (e.g. 'coffee', 'the radio') and the speaker's own invented names (people in the story, the product being sold). " +
      `Return at most ${max}, in order of appearance. A brand's product (e.g. 'Toyota Camry') is a brand.`,
    text,
    { check: (v) => v.references.find((r) => !text.includes(r.surface)) ? "every surface must be an exact substring of the text" : null },
  );
}

export interface Candidate {
  entityId: string;
  name: string;
  type: string;
  tags: string[];
  affinity: number;
}

export const RewriteSchema = z.object({
  picks: z.array(z.object({ referenceId: z.string(), entityId: z.string() })),
  rewrittenSentence: z.string(),
});

/** Picks one Qloo candidate per weak reference and rewrites the sentence around them. */
export function rewriteLLM(
  sentence: string,
  room: string,
  weak: { referenceId: string; surface: string; candidates: Candidate[] }[],
) {
  const body = weak
    .map(
      (w) =>
        `Reference "${w.surface}" (referenceId ${w.referenceId}). Candidates from Qloo, pick exactly one entityId:\n` +
        w.candidates
          .map((c) => `- entityId ${c.entityId}: ${c.name} (${c.type.split(":").pop()}; tags: ${c.tags.slice(0, 5).join(", ") || "none"}; affinity ${c.affinity.toFixed(2)})`)
          .join("\n"),
    )
    .join("\n\n");
  const lo = Math.floor(sentence.length * 0.9);
  const hi = Math.ceil(sentence.length * 1.1);
  return llmJson(
    RewriteSchema,
    "You are a comedy and copy editor. Replace cultural references that will not land with an audience. " +
      "For each reference, choose the candidate that best fits the sentence's meaning and joke, from the given list only. " +
      "Rewrite ONLY this sentence: keep its meaning, structure, tone and punchline, change as few words as possible, " +
      `and use each chosen name as written. Keep it between ${lo} and ${hi} characters.`,
    `Audience: ${room}\n\nSentence: ${sentence}\n\n${body}`,
    { effort: "medium", check: (v) => validateRewrite(weak, v) },
  );
}

/** The LLM may only choose from Qloo's candidates, and must actually use the chosen name. */
export function validateRewrite(weak: { referenceId: string; candidates: Candidate[] }[], v: z.infer<typeof RewriteSchema>): string | null {
  for (const w of weak) {
    const p = v.picks.find((x) => x.referenceId === w.referenceId);
    const c = p && w.candidates.find((x) => x.entityId === p.entityId);
    if (!c) return `pick one entityId from the list for referenceId ${w.referenceId}`;
    if (!v.rewrittenSentence.toLowerCase().includes(c.name.toLowerCase())) return `the sentence must contain "${c.name}"`;
  }
  return null;
}

export const TextSchema = z.object({ text: z.string() });

/** Qloo-off baseline: the LLM rewrites from its own assumptions. */
export async function llmOnlyRewrite(text: string, room: string): Promise<string> {
  const r = await llmJson(
    TextSchema,
    "Rewrite the text so its cultural references land with the described audience. Keep structure, tone and length. Return only the rewritten text.",
    `Audience: ${room}\n\nText:\n${text}`,
  );
  return r.text;
}
