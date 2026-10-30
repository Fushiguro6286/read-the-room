export const ENTITY_TYPES = [
  "urn:entity:artist",
  "urn:entity:movie",
  "urn:entity:tv_show",
  "urn:entity:brand",
  "urn:entity:person",
  "urn:entity:place",
  "urn:entity:book",
  "urn:entity:podcast",
  "urn:entity:videogame", // live API spelling (docs say video_game; /search rejects it)
  "urn:entity:destination",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export interface Tag {
  id: string;
  name: string;
  type?: string;
}

/** One entity, normalized from either /search or /v2/insights. */
export interface QlooEntity {
  id: string;
  name: string;
  type: string;
  popularity?: number;
  tags: Tag[];
  affinity?: number; // only from /v2/insights
}

// Raw shapes (only the fields we read). /search uses `types[]` + tag `tag_id`; /insights uses `subtype` + tag `id`.
export interface RawTag {
  id?: string;
  tag_id?: string;
  name?: string;
  type?: string;
}
export interface RawEntity {
  entity_id: string;
  name: string;
  types?: string[];
  type?: string;
  subtype?: string;
  popularity?: number;
  tags?: RawTag[];
  query?: { affinity?: number };
}
