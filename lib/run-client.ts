// Browser side of /api/run: posts a run and hands each NDJSON message to onMessage.
import type { RunResult, StepEvent } from "./types";

export type RunMessage =
  | (StepEvent & { lane: "a" | "b" })
  | { type: "result"; lane: "a" | "b"; data: RunResult }
  | { type: "error"; lane: "a" | "b"; message: string }
  | { type: "end" };

export async function streamRun(body: { text: string; room: string; suggest?: boolean }, onMessage: (m: RunMessage) => void): Promise<void> {
  const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || "The run failed. Try an example instead.");
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop()!;
    for (const line of lines) if (line.trim()) onMessage(JSON.parse(line));
  }
}
