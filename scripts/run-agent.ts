// Usage: npm run run-agent -- "<text>" "<room>"
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const [text, room] = process.argv.slice(2);
  if (!text || !room) {
    console.error('Usage: npm run run-agent -- "<text>" "<room>"');
    process.exit(1);
  }
  const { runAgent } = await import("../lib/agent"); // after dotenv, so env is set
  const t = Date.now();
  const r = await runAgent({ text, room }, { onStep: (e) => console.log(`[${e.qlooCalls} calls] ${e.key} ${e.status}: ${e.detail}`) });
  console.log(`\n=== Room: ${r.room.label}  (${(Date.now() - t) / 1000}s, ${r.qlooCalls} Qloo calls, ${r.rounds} rounds)`);
  console.log(`Room Score: ${r.roomScoreBefore} → ${r.roomScoreAfter}\n`);
  for (const ref of r.references)
    console.log(
      `- ${ref.surface} [${ref.status}] ${ref.entityName ?? "(no Qloo match)"} ${ref.affinity === undefined ? "" : ref.omitted ? "not a standout" : ref.affinity.toFixed(2)}` +
        (ref.swap ? `  →  ${ref.swap.entityName} ${ref.swap.affinity.toFixed(2)} (shared: ${ref.swap.sharedTags.join(", ") || "-"}; length ${(ref.swap.lengthDelta * 100).toFixed(0)}%)` : ""),
    );
  console.log(`\nBEFORE:\n${r.text}\n\nAFTER (Qloo):\n${r.finalText}\n\nLLM ONLY:\n${r.llmOnlyText}`);
  console.log(`\nSnapshot: ${Object.entries(r.snapshot).map(([k, v]) => `${k}: ${v.map((e) => e.name).join(", ")}`).join(" | ")}`);
  if (r.notes.length) console.log(`Notes: ${r.notes.join("; ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
