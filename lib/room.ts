import { parseRoomLLM } from "./llm";
import type { Params, Qloo } from "./qloo";
import { namesMatch } from "./score";
import type { RoomSignals } from "./types";

const BUCKETS: [string, number, number][] = [
  ["24_and_younger", 0, 24],
  ["25_to_29", 25, 29],
  ["30_to_34", 30, 34],
  ["35_to_44", 35, 44],
  ["45_to_54", 45, 54],
  ["55_and_older", 55, 200],
];

/** Every Qloo age bucket the range overlaps, comma-separated. */
export function ageBuckets(min: number | null, max: number | null): string | undefined {
  if (min === null && max === null) return undefined;
  const lo = min ?? 0;
  const hi = max ?? 200;
  return BUCKETS.filter(([, a, b]) => a <= hi && b >= lo)
    .map(([name]) => name)
    .join(",") || undefined;
}

export function roomParams(room: RoomSignals): Params {
  return {
    "signal.location.query": room.locationQuery,
    "signal.demographics.age": room.ageBucket,
    "signal.demographics.gender": room.gender,
    "signal.interests.entities": room.fanEntityIds?.join(","),
  };
}

export class RoomError extends Error {}

export async function parseRoom(text: string, qloo: Qloo): Promise<RoomSignals> {
  const p = await parseRoomLLM(text);
  const room: RoomSignals = {
    label: text.trim(),
    locationQuery: p.city ?? undefined,
    ageBucket: ageBuckets(p.ageMin, p.ageMax),
    gender: p.gender ?? undefined,
  };
  if (p.fanNames.length) {
    const found = await Promise.all(
      p.fanNames.slice(0, 3).map(async (n) => (await qloo.search(n, undefined, 3)).find((e) => namesMatch(n, e.name))),
    );
    const hits = found.filter((e) => !!e);
    room.fanNames = hits.map((e) => e.name);
    room.fanEntityIds = hits.map((e) => e.id);
  }
  if (!room.locationQuery && !room.ageBucket && !room.fanEntityIds?.length)
    throw new RoomError('Describe the room with a place, an age range, or things they love, e.g. "Atlanta, ages 45–60".');
  return room;
}
