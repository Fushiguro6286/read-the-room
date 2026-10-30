import { cacheGet, cacheSet } from "./cache";
import type { QlooEntity, RawEntity } from "./qloo-types";

const WEEK = 7 * 24 * 3600;

export class QlooBudgetError extends Error {}
export class QlooError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export function normalize(e: RawEntity): QlooEntity {
  return {
    id: e.entity_id,
    name: e.name,
    type: e.subtype ?? e.types?.[0] ?? e.type ?? "",
    popularity: e.popularity,
    tags: (e.tags ?? []).flatMap((t) => {
      const id = t.id ?? t.tag_id; // /insights says `id`, /search says `tag_id`
      return id ? [{ id, name: t.name ?? id, type: t.type }] : [];
    }),
    affinity: e.query?.affinity,
  };
}

export type Params = Record<string, string | undefined>;

/** Stable cache key: path + params sorted by name, empty values dropped. */
export function queryString(params: Params): string {
  return new URLSearchParams(
    Object.entries(params)
      .filter((kv): kv is [string, string] => !!kv[1])
      .sort(([a], [b]) => a.localeCompare(b)),
  ).toString();
}

async function fetchOnce(url: string, key: string, fetchImpl: typeof fetch): Promise<Response> {
  return fetchImpl(url, { headers: { "X-Api-Key": key }, signal: AbortSignal.timeout(10_000) });
}

/**
 * One client per agent run. Counts live (uncached) calls and stops at the budget.
 * `free: true` calls (audience snapshot) skip the budget but are still cached.
 */
export function createQloo(opts: { budget?: number; fetchImpl?: typeof fetch } = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const budget = opts.budget ?? Number(process.env.QLOO_MAX_CALLS_PER_RUN || 20);
  let calls = 0;

  async function get<T>(path: string, params: Params, free = false): Promise<T> {
    const qs = queryString(params);
    const cacheKey = `qloo:${path}?${qs}`;
    const cached = await cacheGet<T>(cacheKey);
    if (cached) return cached;
    if (!free && calls >= budget) throw new QlooBudgetError(`Qloo call budget reached (${budget})`);
    if (!free) calls++;

    const apiKey = process.env.QLOO_API_KEY;
    if (!apiKey) throw new QlooError("QLOO_API_KEY is not set");
    const url = `${process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com"}${path}?${qs}`;

    let res: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await fetchOnce(url, apiKey, fetchImpl);
        if (res.status !== 429 && res.status < 500) break;
      } catch (e) {
        if (attempt === 1) throw new QlooError(`Qloo request failed: ${(e as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 600));
    }
    if (!res!.ok) {
      const body = await res!.text().catch(() => "");
      throw new QlooError(`Qloo ${path} returned ${res!.status}: ${body.slice(0, 200)}`, res!.status);
    }
    const json = (await res!.json()) as T;
    await cacheSet(cacheKey, json, WEEK);
    return json;
  }

  return {
    get calls() {
      return calls;
    },
    budget,
    async search(query: string, type?: string, take = 5): Promise<QlooEntity[]> {
      const j = await get<{ results?: RawEntity[] }>("/search", { query, types: type, take: String(take) });
      return (Array.isArray(j.results) ? j.results : []).map(normalize);
    },
    async insights(params: Params, free = false): Promise<QlooEntity[]> {
      const j = await get<{ results?: { entities?: RawEntity[] } }>("/v2/insights", params, free);
      return (j.results?.entities ?? []).map(normalize);
    },
  };
}

export type Qloo = ReturnType<typeof createQloo>;
