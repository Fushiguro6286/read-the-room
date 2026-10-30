"use client";
import { useRef, useState } from "react";

const MAX_BYTES = 4 * 1024 * 1024; // matches /api/transcribe

/** Upload an audio or video recording of a set; its transcript fills the text box. */
export function RecordingUpload({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  async function upload(file: File) {
    setMsg(null);
    if (file.size > MAX_BYTES) return setMsg({ text: "Files can be up to 4 MB. Trim the clip or upload just the audio.", error: true });
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Couldn't transcribe that recording.");
      onText(j.text);
      setMsg({ text: j.trimmed ? "Transcribed. Trimmed to the first 2,500 characters." : "Transcribed. Check the text, then read the room." });
    } catch (e) {
      setMsg({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        ref={input}
        type="file"
        accept="audio/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) upload(f);
        }}
      />
      <button
        type="button"
        disabled={busy || disabled}
        onClick={() => input.current?.click()}
        className="rounded-full border border-stage-line px-3 py-1 text-xs font-semibold text-[#d8d1c5] hover:border-spot hover:text-spot disabled:opacity-40"
      >
        {busy ? "Transcribing…" : "🎙 Upload a recording (audio or video, up to 4 MB)"}
      </button>
      {msg && (
        <span role={msg.error ? "alert" : "status"} className={`text-xs ${msg.error ? "text-[#ffc9c9]" : "text-[#bdb5a8]"}`}>
          {msg.text}
        </span>
      )}
    </span>
  );
}
