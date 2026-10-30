import { Redis } from "@upstash/redis";

// Upstash when configured, otherwise an in-process Map so local dev works without Redis.
// Lazy: scripts load .env.local after imports run.
let client: Redis | null | undefined;
function getRedis(): Redis | null {
  if (client === undefined) {
    const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = process.env;
    client = url && token ? new Redis({ url, token }) : null;
  }
  return client;
}

// On globalThis so route handlers and pages (separate module copies in dev) share one store.
const g = globalThis as unknown as { __rtrMem?: Map<string, { value: unknown; expires: number }> };
const mem = (g.__rtrMem ??= new Map());

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (redis) return (await redis.get<T>(key)) ?? null;
  const hit = mem.get(key);
  if (!hit) return null;
  if (hit.expires && hit.expires < Date.now()) {
    mem.delete(key);
    return null;
  }
  return hit.value as T;
}

/** ttlSeconds = 0 means no expiry. */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await (ttlSeconds ? redis.set(key, value, { ex: ttlSeconds }) : redis.set(key, value));
    return;
  }
  mem.set(key, { value, expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0 });
}

/** Atomic counter with expiry set on first increment (used by rate limits). */
export async function cacheIncr(key: string, ttlSeconds: number): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, ttlSeconds);
    return n;
  }
  const n = ((await cacheGet<number>(key)) ?? 0) + 1;
  const hit = mem.get(key);
  mem.set(key, { value: n, expires: hit?.expires || Date.now() + ttlSeconds * 1000 });
  return n;
}
