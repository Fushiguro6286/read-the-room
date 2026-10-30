"use client";
import { useState } from "react";
import { batchCsv, MAX_BATCH_ROOMS, parseRooms, stopRoom, swapsOf } from "@/lib/batch";
import { streamRun } from "@/lib/run-client";
import type { RunResult } from "@/lib/types";

type Row = { room: string; state: "waiting" | "running" | "done" | "error"; step?: string; result?: RunResult; error?: string };
type Stop = { city: string; venue: string; date: string; ageRange: string };

/** Batch mode: the same text tuned for several rooms, one live run per room. Rooms can come from tour dates. */
export function BatchPanel({ text, suggest, onOpen }: { text: string; suggest: boolean; onOpen: (r: RunResult) => void }) {
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [tour, setTour] = useState("");
  const [tourBusy, setTourBusy] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);
  const [error, setError] = useState("");

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-sm text-spot underline-offset-4 hover:underline">
        Batch: tune for many rooms or a whole tour at once →
      </button>
    );

  const list = parseRooms(rooms);
  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  async function readTour() {
    setTourBusy(true);
    setError("");
    setStops([]);
    const isUrl = /^https?:\/\//i.test(tour.trim());
    try {
      const res = await fetch("/api/room-from-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "tour", ...(isUrl ? { url: tour } : { description: tour }) }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      if (!j.stops?.length) throw new Error("Couldn't find tour dates there. Try pasting the list of dates and venues.");
      setStops(j.stops);
      setRooms(parseRooms((j.stops as Stop[]).map(stopRoom).join("\n")).join("\n"));
    } catch (e) {
      setError((e as Error).message || "Couldn't read those tour dates.");
    } finally {
      setTourBusy(false);
    }
  }

  async function runAll() {
    setBusy(true);
    setError("");
    setRows(list.map((room) => ({ room, state: "waiting" })));
    // One room at a time: keeps within the LLM's per-minute limit and shows steady progress.
    for (let i = 0; i < list.length; i++) {
      patch(i, { state: "running" });
      try {
        let got = false;
        await streamRun({ text, room: list[i], suggest }, (m) => {
          if (m.type === "step") patch(i, { step: m.detail });
          else if (m.type === "result") {
            got = true;
            patch(i, { state: "done", result: m.data });
          }
          else if (m.type === "error") patch(i, { state: "error", error: m.message });
        });
        if (!got) patch(i, { state: "error", error: "No result" });
      } catch (e) {
        // Rate limit or network: stop here, the remaining rooms would fail the same way.
        patch(i, { state: "error", error: (e as Error).message });
        setRows((rs) => rs.map((r) => (r.state === "waiting" ? { ...r, state: "error", error: "Not run" } : r)));
        break;
      }
    }
    setBusy(false);
  }

  const done = rows.filter((r) => r.result).map((r) => r.result!);

  return (
    <div className="mt-3 rounded-xl border border-stage-line p-3">
      <div className="text-sm font-semibold text-[#d8d1c5]">Batch mode</div>
      <p className="text-xs text-[#bdb5a8]">
        The text above, tuned for up to {MAX_BATCH_ROOMS} rooms. Each room is one live run (6 per hour).
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={tour}
          onChange={(e) => setTour(e.target.value.slice(0, 3000))}
          aria-label="Tour dates link or list"
          placeholder="Tour dates: a ticketing/tour page link, or paste the dates and venues"
          className="flex-1 rounded-lg bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60"
        />
        <button type="button" disabled={tourBusy || tour.trim().length < 5} onClick={readTour} className="rounded-lg border border-spot px-4 py-2 text-sm font-semibold text-spot disabled:opacity-40">
          {tourBusy ? "Reading…" : "Make room presets"}
        </button>
      </div>
      {stops.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2 text-xs">
          {stops.map((s, i) => (
            <li key={i} className="rounded-full border border-stage-line px-3 py-1 text-[#d8d1c5]">
              <b className="text-spot">{stopRoom(s)}</b>
              {[s.venue, s.date].filter(Boolean).length > 0 && <span className="text-[#8f877b]"> · {[s.venue, s.date].filter(Boolean).join(" · ")}</span>}
            </li>
          ))}
        </ul>
      )}

      <label htmlFor="batch-rooms" className="mt-3 block text-xs font-bold uppercase tracking-[0.2em] text-spot">
        Rooms, one per line
      </label>
      <textarea
        id="batch-rooms"
        value={rooms}
        onChange={(e) => setRooms(e.target.value.slice(0, 1200))}
        rows={4}
        placeholder={"Austin, ages 25–34\nPhoenix, ages 55 and over\nLondon, 25–34"}
        className="mt-1 w-full rounded-lg bg-paper p-3 text-sm text-ink placeholder:text-ink-soft/60"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || list.length === 0 || text.trim().length < 10}
          onClick={runAll}
          className="rounded-lg bg-spot px-4 py-2 text-sm font-semibold text-stage disabled:opacity-40"
        >
          {busy ? "Running…" : `Run ${list.length || ""} room${list.length === 1 ? "" : "s"}`}
        </button>
        {text.trim().length < 10 && <span className="text-xs text-[#bdb5a8]">Paste your text above first.</span>}
        {done.length > 0 && !busy && (
          <button
            type="button"
            onClick={() => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob(["﻿" + batchCsv(done)], { type: "text/csv" }));
              a.download = "read-the-room-batch.csv";
              a.click();
              URL.revokeObjectURL(a.href);
            }}
            className="rounded-lg border border-stage-line px-4 py-2 text-sm font-semibold text-[#d8d1c5] hover:border-spot hover:text-spot"
          >
            Download CSV
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-[#ffc9c9]">
          {error}
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-[#8f877b]">
              <tr>
                <th className="py-1 pr-3 font-semibold">Room</th>
                <th className="py-1 pr-3 font-semibold">Room Score</th>
                <th className="py-1 pr-3 font-semibold">Swaps</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-stage-line align-top">
                  <td className="py-2 pr-3 font-semibold text-[#f3efe8]">{r.room}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {r.result ? (
                      <>
                        <span className="text-[#8f877b]">{r.result.roomScoreBefore}</span> → <b className="text-spot">{r.result.roomScoreAfter}</b>
                      </>
                    ) : (
                      <span className={r.state === "error" ? "text-[#ffc9c9]" : "text-[#8f877b]"}>{r.state === "running" ? r.step || "Starting…" : r.state === "error" ? r.error : "Waiting"}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-[#d8d1c5]">{r.result ? swapsOf(r.result).join(", ") || "None needed" : ""}</td>
                  <td className="py-2 text-right">
                    {r.result && (
                      <button type="button" onClick={() => onOpen(r.result!)} className="text-sm font-semibold text-spot hover:underline">
                        Open
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
