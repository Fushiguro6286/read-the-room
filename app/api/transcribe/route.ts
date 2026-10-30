import { createHash } from "node:crypto";
import { cacheIncr } from "@/lib/cache";
import { transcribeMedia } from "@/lib/llm";
import { clientIp, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";

export const maxDuration = 90;

// shortcut: Vercel caps request bodies at 4.5 MB, so uploads stop at 4 MB. Upgrade to direct uploads (Gemini Files API) for full-length set recordings.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_TEXT = 2500;

/** multipart "file" (audio/* or video/*, up to 4 MB) -> { text, trimmed } */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose an audio or video file." }, { status: 400 });
  if (!/^(audio|video)\//.test(file.type)) return Response.json({ error: "That file isn't audio or video." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "Files can be up to 4 MB. Trim the clip or upload just the audio." }, { status: 413 });

  const ip = createHash("sha256").update(clientIp(req)).digest("hex").slice(0, 16);
  if ((await cacheIncr(`rl:tx:${ip}:${new Date().toISOString().slice(0, 13)}`, 3600)) > 10) return Response.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });

  try {
    const text = await transcribeMedia(Buffer.from(await file.arrayBuffer()), file.type);
    if (!text) return Response.json({ error: "Couldn't hear any speech in that recording." }, { status: 422 });
    return Response.json({ text: text.slice(0, MAX_TEXT), trimmed: text.length > MAX_TEXT });
  } catch (e) {
    console.error("transcribe failed:", e);
    return Response.json({ error: "Couldn't transcribe that recording. Try again, or paste the text." }, { status: 502 });
  }
}
