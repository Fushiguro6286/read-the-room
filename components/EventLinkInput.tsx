"use client";
import { useState } from "react";

/** Paste an event link or description; the LLM proposes a room the user confirms or edits. */
export function EventLinkInput({ onUse }: { onUse: (room: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<{ room: string; reasoning: string } | null>(null);

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-sm text-spot underline-offset-4 hover:underline">
        Or describe the room from an event link →
      </button>
    );

  async function suggest() {
    setBusy(true);
    setError("");
    setProposal(null);
    const isUrl = /^https?:\/\//i.test(value.trim());
    try {
      const res = await fetch("/api/room-from-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(isUrl ? { url: value } : { description: value }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      const room = [j.city, j.ageRange && `ages ${j.ageRange}`].filter(Boolean).join(", ");
      if (!room) throw new Error("Couldn't tell the audience from that. Try adding the city.");
      setProposal({ room, reasoning: j.reasoning });
    } catch (e) {
      setError((e as Error).message || "Couldn't read that event.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-stage-line p-3">
      <label htmlFor="event" className="text-sm font-semibold text-[#d8d1c5]">
        Event link or description
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id="event"
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 2000))}
          placeholder="https://… or “Comedy night at a brewery in Austin, 21+”"
          className="flex-1 rounded-lg bg-paper px-3 py-2 text-ink placeholder:text-ink-soft/60"
        />
        <button type="button" disabled={busy || value.trim().length < 5} onClick={suggest} className="rounded-lg border border-spot px-4 py-2 text-sm font-semibold text-spot disabled:opacity-40">
          {busy ? "Reading…" : "Suggest room"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-[#ffc9c9]">
          {error}
        </p>
      )}
      {proposal && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg bg-stage p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold text-spot">{proposal.room}</div>
            <div className="text-xs text-[#bdb5a8]">{proposal.reasoning}</div>
          </div>
          <button type="button" onClick={() => onUse(proposal.room)} className="rounded-lg bg-spot px-3 py-1.5 text-sm font-semibold text-stage">
            Use this room
          </button>
        </div>
      )}
    </div>
  );
}
