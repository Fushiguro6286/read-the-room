// Milestone 0: verify Qloo parameter names and response shapes against the live API.
// Usage: npm run probe   (needs QLOO_API_KEY in .env.local)
// Raw responses go to data/qloo-raw/ (git-ignored: Qloo terms forbid public storage).
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

config({ path: ".env.local" });
const BASE = process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com";
const KEY = process.env.QLOO_API_KEY;
if (!KEY) {
  console.error("QLOO_API_KEY missing in .env.local");
  process.exit(1);
}
const RAW = path.join("data", "qloo-raw");
fs.mkdirSync(RAW, { recursive: true });

let n = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function q(label: string, p: string, params: Record<string, string>): Promise<any> {
  const url = `${BASE}${p}?${new URLSearchParams(params)}`;
  const t = Date.now();
  const res = await fetch(url, { headers: { "X-Api-Key": KEY! } });
  const text = await res.text();
  n++;
  fs.writeFileSync(path.join(RAW, `${String(n).padStart(2, "0")}-${label}.json`), text);
  console.log(`\n### [${res.status}] ${label} (${Date.now() - t} ms)\n${p}?${decodeURIComponent(new URLSearchParams(params).toString())}`);
  try {
    return JSON.parse(text);
  } catch {
    console.log(text.slice(0, 300));
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ents = (j: any): any[] => j?.results?.entities ?? j?.results ?? j?.entities ?? [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function show(j: any, max = 10) {
  if (!j) return;
  if (j.success === false || j.error || j.errors) console.log("ERROR:", JSON.stringify(j).slice(0, 400));
  const list = ents(j);
  console.log("top-level keys:", Object.keys(j), "| results keys:", j.results && Object.keys(j.results));
  if (list[0]) console.log("entity keys:", Object.keys(list[0]), "| query keys:", list[0].query && Object.keys(list[0].query));
  for (const e of list.slice(0, max)) {
    console.log(
      ` - ${e.name} | ${e.entity_id} | ${e.subtype ?? e.types?.join(",") ?? e.type} | aff=${e.query?.affinity ?? e.affinity ?? "-"} | pop=${e.popularity ?? "-"} | tags=${(e.tags ?? []).slice(0, 4).map((t: { name?: string; id?: string; tag_id?: string }) => t.name ?? t.id ?? t.tag_id).join("; ")}`,
    );
  }
}

const REFS = [
  { name: "Oprah", type: "urn:entity:person" },
  { name: "MrBeast", type: "urn:entity:person" },
  { name: "Blockbuster", type: "urn:entity:brand" },
  { name: "Friends", type: "urn:entity:tv_show" },
  { name: "Drake", type: "urn:entity:artist" },
  { name: "Toyota Camry", type: "urn:entity:brand" },
];
const ROOMS = [
  { label: "Atlanta 45-60", loc: "Atlanta", age: "45_to_54,55_and_older" },
  { label: "Brooklyn 25-34", loc: "Brooklyn", age: "25_to_29,30_to_34" },
  { label: "London 25-34", loc: "London", age: "25_to_29,30_to_34" },
];

async function main() {
  // 1. Resolve: with type filter, and without
  const resolved: { name: string; type: string; id: string; tags: string[] }[] = [];
  for (const r of REFS) {
    const j = await q(`search-${r.name}`, "/search", { query: r.name, types: r.type, take: "3" });
    show(j, 3);
    let top = ents(j)[0];
    if (!top) {
      const j2 = await q(`search-notype-${r.name}`, "/search", { query: r.name, take: "3" });
      show(j2, 3);
      top = ents(j2)[0];
    }
    if (top)
      resolved.push({
        name: r.name,
        type: r.type,
        id: top.entity_id,
        tags: (top.tags ?? []).map((t: { id?: string; tag_id?: string }) => t.id ?? t.tag_id),
      });
  }
  console.log("\nRESOLVED:", resolved.map((r) => `${r.name}=${r.id}`).join(", "));

  // 2. Score each type for each room (one call per type per room)
  const byType = new Map<string, typeof resolved>();
  for (const r of resolved) byType.set(r.type, [...(byType.get(r.type) ?? []), r]);
  for (const room of ROOMS) {
    for (const [type, list] of byType) {
      const j = await q(`score-${room.label}-${type.split(":").pop()}`, "/v2/insights", {
        "filter.type": type,
        "signal.location.query": room.loc,
        "signal.demographics.age": room.age,
        "filter.results.entities": list.map((r) => r.id).join(","),
        "feature.explainability": "true",
      });
      show(j);
    }
  }

  // 3. Does age alone / location alone change affinity? (persons, no location vs no age)
  const persons = byType.get("urn:entity:person") ?? [];
  if (persons.length) {
    const ids = persons.map((r) => r.id).join(",");
    for (const age of ["24_and_younger", "55_and_older"])
      show(await q(`age-only-${age}`, "/v2/insights", { "filter.type": "urn:entity:person", "signal.demographics.age": age, "filter.results.entities": ids }));
    for (const loc of ["Atlanta", "London"])
      show(await q(`loc-only-${loc}`, "/v2/insights", { "filter.type": "urn:entity:person", "signal.location.query": loc, "filter.results.entities": ids }));
  }

  // 4. Swap candidates for Blockbuster in Brooklyn 25-34
  const bb = resolved.find((r) => r.name === "Blockbuster");
  if (bb) {
    const j = await q("swaps-blockbuster-brooklyn", "/v2/insights", {
      "filter.type": bb.type,
      "signal.location.query": "Brooklyn",
      "signal.demographics.age": "25_to_29,30_to_34",
      "filter.tags": bb.tags.slice(0, 3).join(","),
      "operator.filter.tags": "union",
      "filter.exclude.entities": bb.id,
      take: "10",
    });
    show(j);
  }

  // 5. Snapshot: top 5 tv shows for Atlanta 45-60
  show(await q("snapshot-atlanta-tv", "/v2/insights", { "filter.type": "urn:entity:tv_show", "signal.location.query": "Atlanta", "signal.demographics.age": "45_to_54,55_and_older", take: "5" }));

  // 6. Tags endpoint shape
  show(await q("tags-search", "/v2/tags", { "filter.query": "nostalgia", take: "3" }), 3);

  console.log(`\nTotal Qloo calls: ${n}. Raw JSON in ${RAW}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
