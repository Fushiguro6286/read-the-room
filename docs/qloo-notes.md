# Qloo API notes (Milestone 0)

Verified against the docs on 2026-10-28. Live-API results are filled in below once the probe runs.

## Differences from the build prompt

| Build prompt said | Docs/live API say | What we do |
| --- | --- | --- |
| `urn:entity:videogame` | `urn:entity:video_game` | Use `video_game` |
| Commit `data/demos/*.json` and recorded fixtures to the repo | Qloo guide: "Don't store Qloo response data in a public repository." Private server-side caching is allowed with no time limit. | Demos live in Upstash Redis (no expiry), written by `scripts/precompute-demos.ts`. A git-ignored local copy in `data/demos/` serves local dev. Tests use small hand-written fixtures, not raw Qloo responses. |
| Age is a range | `signal.demographics.age` takes comma-separated buckets: `24_and_younger`, `25_to_29`, `30_to_34`, `35_to_44`, `45_to_54`, `55_and_older` | `lib/room.ts` maps a range to every bucket it overlaps |

## Confirmed from docs

- Base URL `https://hackathon.api.qloo.com`, header `X-Api-Key`. Other environments return 401 with hackathon keys.
- Unknown parameters are silently ignored; an empty 200 can mean a bad parameter.
- `/search` `types` values may differ from `filter.type` (verify live).
- `signal.location.query`: fuzzy locality name; 400 if not found.
- `signal.demographics.gender`: `male` or `female`.
- `filter.results.entities`, `filter.exclude.entities`, `filter.tags`, `operator.filter.tags` (`union`|`intersection`), `feature.explainability=true`, `take` (default 20, max 50).

## Live probe results

_Pending: needs `QLOO_API_KEY`._
