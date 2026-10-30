// Runs every demo for both rooms and stores the results in Redis (+ git-ignored data/demos/).
// Usage: npm run precompute [-- <slug>]
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { runAgent } = await import("../lib/agent");
  const { saveDemo } = await import("../lib/demos");
  const { DEMOS } = await import("../lib/demo-list");
  const only = process.argv[2];
  for (const d of DEMOS.filter((x) => !only || x.slug === only)) {
    console.log(`\n== ${d.slug}`);
    const [a, b] = await Promise.all(
      [d.roomA, d.roomB].map((room) =>
        runAgent({ text: d.text, room }, { onStep: (e) => console.log(`  [${room}] ${e.key} ${e.status}: ${e.detail.slice(0, 140)}`) }),
      ),
    );
    await saveDemo(d.slug, { a, b });
    console.log(`  saved: A ${a.roomScoreBefore}→${a.roomScoreAfter} (${a.qlooCalls} calls) | B ${b.roomScoreBefore}→${b.roomScoreAfter} (${b.qlooCalls} calls)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
