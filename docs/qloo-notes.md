# Qloo API notes (Milestone 0)

Verified against the docs on 2026-10-28. Live-API results are filled in below once the probe runs.

## Differences from the build prompt

| Build prompt said | Docs/live API say | What we do |
| --- | --- | --- |
| `urn:entity:videogame` | Docs say `video_game`, but live `/search` returns 400 for it and only accepts `urn:entity:videogame` | Use `videogame` |
| Commit `data/demos/*.json` and recorded fixtures to the repo | Qloo guide: "Don't store Qloo response data in a public repository." Private server-side caching is allowed with no time limit. | Demos live in Upstash Redis (no expiry), written by `scripts/precompute-demos.ts`. A git-ignored local copy in `data/demos/` serves local dev. Tests use small hand-written fixtures, not raw Qloo responses. |
| Age is a range | `signal.demographics.age` takes comma-separated buckets: `24_and_younger`, `25_to_29`, `30_to_34`, `35_to_44`, `45_to_54`, `55_and_older` | `lib/room.ts` maps a range to every bucket it overlaps |

## Confirmed from docs

- Base URL `https://hackathon.api.qloo.com`, header `X-Api-Key`. Other environments return 401 with hackathon keys.
- Unknown parameters are silently ignored; an empty 200 can mean a bad parameter.
- `/search` `types` values may differ from `filter.type` (verify live).
- `signal.location.query`: fuzzy locality name; 400 if not found.
- `signal.demographics.gender`: `male` or `female`.
- `filter.results.entities`, `filter.exclude.entities`, `filter.tags`, `operator.filter.tags` (`union`|`intersection`), `feature.explainability=true`, `take` (default 20, max 50).

## Live probe results (2026-10-30)

**Response shapes**
- `/search` returns `{ results: Entity[] }`, a plain array. Each entity has `entity_id`, `name`, `types[]`, `popularity`, `tags[]`. Each tag has `{ tag_id, name, type }`.
- `/v2/insights` returns `{ success, results: { entities[] }, warnings?, query }`. Each entity has `type` (always `urn:entity`), `subtype` (for example `urn:entity:tv_show`), `tags[]`, and `query.affinity` (0..1). Each tag has `{ id, name, type }`. **Note: `/search` calls the tag ID `tag_id`, `/insights` calls it `id`.**
- `feature.explainability=true` returned `warnings: [{type: "Could not calculate explainability"}]` on every scoring call. We do not depend on it.

**Location drops non-local entities (most important finding)**
- When a request includes `signal.location.query`, `filter.results.entities` returns only entities that stand out in that place. Friends, Drake and Toyota were left out in Atlanta, Brooklyn and London, both with and without age. `signal.location.weight=very_low|low|0.1` and `signal.location.radius=800000` did not change this.
- People still score with a location: Oprah 0.96 and MrBeast 0.90 for Atlanta 45–60.
- With age only, everything scores: Friends 0.69 for 45+, 0.83 for 25–34.
- Decision (as planned in Section 4): a resolved reference that Qloo leaves out = **weak**, stored as affinity 0.05 with `omitted: true`. The UI says "Not a standout for this room in Qloo". It never shows 0.05 as if it were a Qloo number.

**Signals do change affinity**
- Age: MrBeast 0.95 (24 and under) vs 0.66 (55+). Oprah 0.84 vs 0.90.
- Location: Atlanta's top TV shows are P-Valley, Insecure, Empire, Atlanta. London's top artists are RAYE, Hamzaa, Rina Sawayama. London works for the global example.

**Swap candidates** (same type + room + original's top 3 tags, `operator.filter.tags=union`, exclude the original, `take=10`) work and differ by room. For Friends: Atlanta 45–60 gets Colbert 0.98, The Goldbergs 0.95. Brooklyn 25–34 gets Four Weddings and a Funeral 0.95.

**Resolution gotchas**
- "Blockbuster" has no brand match. Untyped search returns a *place* (a store in Bend, OR). Rule: the untyped fallback skips place/destination results unless the guessed type is place/destination.
- "Toyota Camry" with `types=brand` returns "Toyota". Rule: accept a match when name similarity ≥ 0.8 **or** the entity name appears as whole words inside the surface text.
- `/v2/insights` with `filter.type=urn:entity:videogame` and age only returns 400 ("at least one valid signal or filter is required"). Treat games scored with age only as unknown.

**Calibrated thresholds** (`lib/score.ts`)
- Affinities that come back fall between 0.6 and 1.0. Swap candidates fall between 0.87 and 0.98.
- `strong ≥ 0.90`, `ok ≥ 0.80`, otherwise `weak`. Left out = weak (0.05). Room Score = round(100 × mean affinity of known references). Raw affinity is already 0..1, so no rescaling is needed.
- A swap is kept only when the new affinity ≥ the original's + 0.10.
