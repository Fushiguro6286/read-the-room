import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// The only file that talks to the LLM provider. Gemini (free tier) when GEMINI_API_KEY is set, otherwise Claude.
let client: Anthropic | undefined;
const claude = () => (client ??= new Anthropic());

type Effort = "low" | "medium" | "high";

async function claudeJson(schema: z.ZodType, system: string, prompt: string, effort: Effort): Promise<unknown> {
  const res = await claude().messages.parse({
    model: process.env.LLM_MODEL || "claude-sonnet-5-5",
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(schema), effort },
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined this text.");
  return res.parsed_output;
}

/** Text of the final model output. The SDKs call it output_text; raw responses carry it in steps[].content[]. */
export function geminiText(j: { output_text?: string; steps?: { type?: string; content?: { text?: string }[] }[] }): string {
  if (typeof j.output_text === "string") return j.output_text;
  const out = (j.steps ?? []).filter((s) => s.type === "model_output").at(-1);
  return (out?.content ?? []).map((c) => c.text ?? "").join("");
}

async function geminiJson(schema: z.ZodType, system: string, prompt: string, effort: Effort): Promise<unknown> {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  void $schema;
  const body = JSON.stringify({
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    system_instruction: system,
    input: prompt,
    store: false,
    response_format: { type: "text", mime_type: "application/json", schema: jsonSchema },
    generation_config: { thinking_level: effort === "high" ? "high" : effort },
  });
  let res: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body,
      signal: AbortSignal.timeout(60_000),
    });
    // Free tier has a per-minute cap: back off and retry on 429/5xx.
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
  }
  const j = await res!.json().catch(() => ({}));
  if (!res!.ok) throw new Error(`Gemini ${res!.status}: ${j?.error?.code ?? ""} ${j?.error?.message ?? ""}`.trim());
  try {
    return JSON.parse(geminiText(j));
  } catch {
    return null; // fails zod validation below, which retries with feedback
  }
}

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
  const call = process.env.GEMINI_API_KEY ? geminiJson : claudeJson;
  let prompt = user;
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await call(schema, system, prompt, opts.effort ?? "low");
    const parsed = schema.safeParse(raw);
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
