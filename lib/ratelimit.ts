import { createHash } from "node:crypto";
import { cacheIncr } from "./cache";

export const RATE_LIMIT_MESSAGE = "Live runs are busy right now. Try an example, or come back in an hour.";

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

/** Counts one live run. Returns false when any limit (per-IP hour/day, global day) is exceeded. */
export async function allowLiveRun(req: Request): Promise<boolean> {
  const ip = createHash("sha256").update(clientIp(req)).digest("hex").slice(0, 16);
  const now = new Date();
  const hour = now.toISOString().slice(0, 13);
  const day = now.toISOString().slice(0, 10);
  const env = (k: string, d: number) => Number(process.env[k] || d);
  const [h, d, g] = await Promise.all([
    cacheIncr(`rl:h:${ip}:${hour}`, 3600),
    cacheIncr(`rl:d:${ip}:${day}`, 86400),
    cacheIncr(`rl:g:${day}`, 86400),
  ]);
  return h <= env("LIVE_RUNS_PER_IP_PER_HOUR", 6) && d <= env("LIVE_RUNS_PER_IP_PER_DAY", 20) && g <= env("LIVE_RUNS_PER_DAY_GLOBAL", 300);
}
