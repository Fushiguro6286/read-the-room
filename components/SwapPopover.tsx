"use client";
import { useEffect, useRef } from "react";
import type { ReferenceResult } from "@/lib/types";
import { AffinityBar, affinityText, QlooTag, StatusBadge } from "./ui";

const typeName = (t?: string) => (t ? t.split(":").pop()!.replace("_", " ") : "unknown type");

/** "Why this swap?" card. A centered dialog on desktop, a bottom sheet on phones. */
export function SwapPopover({ r, onClose }: { r: ReferenceResult; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const s = r.swap;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={s ? "Why this swap?" : `About ${r.surface}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl bg-paper p-5 text-ink shadow-2xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="font-display text-2xl uppercase tracking-wide">{s ? "Why this swap?" : r.surface}</h3>
          <button ref={closeRef} type="button" onClick={onClose} className="rounded-full px-2 text-2xl leading-none text-ink-soft hover:text-ink" aria-label="Close">
            ×
          </button>
        </div>
        {s ? (
          <div className="space-y-4">
            <AffinityBar label={`Before: ${r.entityName ?? r.surface}`} value={r.affinity} omitted={r.omitted} tone="weak" />
            <AffinityBar label={`After: ${s.entityName}`} value={s.affinity} tone="strong" />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-ink-soft">Type</dt>
              <dd className="capitalize">{typeName(s.entityType)} (same as the original)</dd>
              <dt className="text-ink-soft">Shared tags</dt>
              <dd className="flex flex-wrap gap-1.5">
                {s.sharedTags.length ? s.sharedTags.map((t) => <span key={t} className="rounded-full bg-spot/15 px-2 py-0.5 text-xs font-medium text-ink">{t}</span>) : <span className="text-ink-soft">Matched on the original&apos;s top tags</span>}
              </dd>
              <dt className="text-ink-soft">Length</dt>
              <dd>
                {s.lengthDelta >= 0 ? "+" : ""}
                {Math.round(s.lengthDelta * 100)}% vs the original sentence
              </dd>
            </dl>
            <div className="rounded-xl bg-stage/5 p-3 text-sm">
              <p className="text-ink-soft line-through decoration-weak/60">{s.originalSentence}</p>
              <p className="mt-1 font-medium">{s.rewrittenSentence}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <StatusBadge status={r.status} />
            {r.entityId ? (
              <>
                <AffinityBar label={r.entityName ?? r.surface} value={r.affinity} omitted={r.omitted} />
                <p className="text-sm text-ink-soft">
                  {affinityText(r)}. Matched to <b className="text-ink">{r.entityName}</b> ({typeName(r.entityType)}).
                  {r.status === "weak" && " No stronger replacement passed Qloo's verification."}
                </p>
                {!!r.tags.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.tags.slice(0, 6).map((t) => (
                      <span key={t.id} className="rounded-full bg-rule px-2 py-0.5 text-xs">{t.name}</span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-ink-soft">Qloo has no data for this reference, so it is left out of the Room Score.</p>
            )}
          </div>
        )}
        <p className="mt-5 flex items-center gap-2 border-t border-rule pt-3 text-xs text-ink-soft">
          <QlooTag /> Source: Qloo Insights API · numbers are Qloo affinity (0–1) for this room
        </p>
      </div>
    </div>
  );
}
