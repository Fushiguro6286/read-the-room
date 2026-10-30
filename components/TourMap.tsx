"use client";
import { useState } from "react";
import { classify } from "@/lib/score";
import type { TourCell, TourRoom } from "@/lib/tour";
import type { RunResult, Status } from "@/lib/types";
import { affinityText, Panel, QlooTag } from "./ui";

const TINT: Record<Status, string> = {
  strong: "bg-strong/15 text-strong",
  ok: "bg-ok/15 text-ok",
  weak: "bg-weak/10 text-weak",
  unknown: "bg-rule/60 text-unknown",
};

/** Heatmap: the same references scored by Qloo for each age group and gender. */
export function TourMap({ result }: { result: RunResult }) {
  const refs = result.references.filter((r) => r.entityId && r.entityType);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [rooms, setRooms] = useState<TourRoom[]>([]);
  if (!refs.length) return null;

  const load = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/tour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ references: refs.map(({ id, entityId, entityType }) => ({ id, entityId, entityType })) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Something went wrong");
      setRooms(j.rooms);
      setState("done");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  };

  const cols = rooms;
  const best = Math.max(...cols.map((c) => c.score ?? -1));

  return (
    <Panel title="Who it lands with" action={<QlooTag />}>
      <p className="text-sm text-ink-soft">
        The references as written, scored by Qloo for each age group and gender. No rewriting and no LLM: just the taste graph.
      </p>
      {state !== "done" && (
        <button
          type="button"
          onClick={load}
          disabled={state === "loading"}
          className="mt-3 rounded-full bg-stage px-5 py-2.5 text-sm font-semibold text-spot hover:brightness-125 disabled:opacity-60"
        >
          {state === "loading" ? "Asking Qloo about 7 audiences…" : "See who it lands with →"}
        </button>
      )}
      {state === "error" && <p className="mt-2 text-sm text-weak">{error}</p>}
      {state === "done" && (
        <div className="mt-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[640px] border-separate border-spacing-1 text-sm">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 bg-paper text-left text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Reference
                </th>
                {cols.map((c) => (
                  <th key={c.label} scope="col" className="px-1 pb-1 text-center align-bottom text-xs font-semibold leading-tight">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {refs.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="sticky left-0 max-w-[10rem] truncate bg-paper pr-2 text-left font-semibold" title={r.entityName}>
                    {r.surface}
                  </th>
                  {cols.map((c) => (
                    <Cell key={c.label} cell={c.cells[r.id] ?? {}} />
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row" className="sticky left-0 bg-paper pt-2 text-left text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Room Score
                </th>
                {cols.map((c) => (
                  <td key={c.label} className="pt-2 text-center">
                    <span className={`font-display text-3xl leading-none tabular-nums ${c.score === null ? "text-unknown" : c.score === best ? "text-strong" : "text-ink"}`}>{c.score ?? "—"}</span>
                    {c.score === best && <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-strong">Lands best</span>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Cell({ cell }: { cell: TourCell }) {
  const status = classify(cell.affinity);
  return (
    <td title={affinityText(cell)} className={`rounded-md px-2 py-2 text-center font-semibold tabular-nums ${TINT[status]}`}>
      {cell.affinity === undefined ? "?" : cell.omitted ? "low" : cell.affinity.toFixed(2)}
    </td>
  );
}
