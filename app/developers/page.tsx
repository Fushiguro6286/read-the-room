import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Public API · Read the Room" };

const curl = `curl -X POST https://YOUR-APP-URL/api/v1/rewrite \
  -H "Content-Type: application/json" \
  -d '{"text": "Mornings with Brewly feel like the opening of a Friends episode.", "room": "Austin, ages 25-34"}'`;

const sample = `{
  "text": "Mornings with Brewly feel like the opening of a Friends episode.",
  "room": { "label": "Austin, ages 25-34", "locationQuery": "Austin", "ageBucket": "25_to_29,30_to_34" },
  "finalText": "…the sentence with verified swaps applied…",
  "llmOnlyText": "…the same text rewritten with no taste data…",
  "references": [{
    "id": "r1", "surface": "Friends", "start": 50, "end": 57,
    "entityId": "…", "entityName": "Friends", "entityType": "urn:entity:tv_show",
    "affinity": 0.05, "omitted": true, "status": "weak",
    "swap": { "entityName": "…", "affinity": 0.94, "sharedTags": ["…"],
              "originalSentence": "…", "rewrittenSentence": "…", "lengthDelta": 0.03, "accepted": true }
  }],
  "roomScoreBefore": 5, "roomScoreAfter": 94,
  "snapshot": { "tv_show": [{ "entityId": "…", "name": "…", "affinity": 0.99 }] },
  "qlooCalls": 6, "rounds": 1, "notes": [], "createdAt": "…"
}`;

export default function Developers() {
  return (
    <div className="spotlight min-h-screen px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="font-display text-xl uppercase tracking-widest text-spot">
          Read the Room
        </Link>
        <h1 className="mt-6 font-display text-5xl uppercase">Public API</h1>
        <p className="mt-3 text-[#d8d1c5]">
          One endpoint. Send text and a room; get back the Qloo-grounded rewrite with every reference&apos;s affinity, the verified swaps, and the Room Score. Same rate limits as the site.
        </p>
        <h2 className="mt-8 font-display text-2xl uppercase text-spot">POST /api/v1/rewrite</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[#d8d1c5]">
          <li>
            <code>text</code>: string, 10–2,500 characters
          </li>
          <li>
            <code>room</code>: string, e.g. &quot;Atlanta, ages 45–60&quot; or &quot;fans of Taylor Swift&quot;
          </li>
        </ul>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-stage-2 p-4 text-sm text-[#f3efe8]">{curl}</pre>
        <h3 className="mt-6 font-semibold">Response (abridged)</h3>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-stage-2 p-4 text-xs text-[#f3efe8]">{sample}</pre>
        <h3 className="mt-6 font-semibold">Notes</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[#d8d1c5]">
          <li>
            <code>affinity</code> is Qloo&apos;s 0–1 affinity for the room. <code>omitted: true</code> means Qloo resolved the reference but left it out of the room&apos;s results (treated as weak).
          </li>
          <li>References Qloo can&apos;t find have no <code>affinity</code> and are excluded from the Room Score.</li>
          <li>Errors return <code>{`{ "error": "…" }`}</code> with status 400 (bad input), 429 (rate limit) or 502 (upstream).</li>
        </ul>
      </div>
    </div>
  );
}
