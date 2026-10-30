import fs from "node:fs/promises";
import path from "node:path";
import { cacheGet, cacheSet } from "./cache";
import { DEMOS } from "./demo-list";
import type { SharedRun } from "./share";

// Demos hold Qloo response data, so they live in private Redis (no expiry), never in the public repo.
// data/demos/ is a git-ignored local copy for dev.
const file = (slug: string) => path.join(process.cwd(), "data", "demos", `${slug}.json`);

export async function loadDemo(slug: string): Promise<SharedRun | null> {
  if (!DEMOS.some((d) => d.slug === slug)) return null;
  const hit = await cacheGet<SharedRun>(`demo:${slug}`);
  if (hit) return hit;
  try {
    return JSON.parse(await fs.readFile(file(slug), "utf8")) as SharedRun;
  } catch {
    return null;
  }
}

export async function saveDemo(slug: string, run: SharedRun): Promise<void> {
  await cacheSet(`demo:${slug}`, run, 0);
  await fs.mkdir(path.dirname(file(slug)), { recursive: true });
  await fs.writeFile(file(slug), JSON.stringify(run, null, 1));
}
