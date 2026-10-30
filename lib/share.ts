import { nanoid } from "nanoid";
import { z } from "zod";
import { cacheGet, cacheSet } from "./cache";
import type { RunResult } from "./types";

const MONTH = 30 * 24 * 3600;

export interface SharedRun {
  a: RunResult;
  b?: RunResult;
}

// Loose shape check at the trust boundary; the page escapes everything it renders.
export const SharedRunSchema = z.object({
  a: z.looseObject({ text: z.string().max(2500), references: z.array(z.looseObject({})).max(20) }),
  b: z.looseObject({ text: z.string().max(2500), references: z.array(z.looseObject({})).max(20) }).optional(),
});

export async function saveShare(run: SharedRun): Promise<string> {
  const id = nanoid(10);
  await cacheSet(`share:${id}`, run, MONTH);
  return id;
}

export async function loadShare(id: string): Promise<SharedRun | null> {
  if (!/^[\w-]{6,20}$/.test(id)) return null;
  return cacheGet<SharedRun>(`share:${id}`);
}
