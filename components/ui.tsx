import type { ReferenceResult, Status } from "@/lib/types";

export const STATUS: Record<Status, { label: string; icon: string; text: string; deco: string; bg: string }> = {
  strong: { label: "Lands", icon: "✓", text: "text-strong", deco: "decoration-strong", bg: "bg-strong" },
  ok: { label: "Okay", icon: "~", text: "text-ok", deco: "decoration-ok", bg: "bg-ok" },
  weak: { label: "Misses", icon: "!", text: "text-weak", deco: "decoration-weak", bg: "bg-weak" },
  unknown: { label: "No data", icon: "?", text: "text-unknown", deco: "decoration-unknown", bg: "bg-unknown" },
};

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-current px-2 py-0.5 text-xs font-semibold ${s.text}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}

/** Human description of a reference's Qloo score (never invents a number). */
export function affinityText(r: Pick<ReferenceResult, "affinity" | "omitted">): string {
  if (r.affinity === undefined) return "Qloo has no data for this reference";
  if (r.omitted) return "Not a standout for this room in Qloo";
  return `Qloo affinity ${r.affinity.toFixed(2)}`;
}

export function AffinityBar({ value, omitted, label, tone = "spot" }: { value?: number; omitted?: boolean; label: string; tone?: "spot" | "strong" | "weak" }) {
  const color = tone === "strong" ? "bg-strong" : tone === "weak" ? "bg-weak" : "bg-spot";
  return (
    <div>
      <div className="flex justify-between gap-3 text-sm">
        <span className="font-medium truncate">{label}</span>
        <span className="tabular-nums text-ink-soft shrink-0">{value === undefined ? "no data" : omitted ? "below Qloo cutoff" : value.toFixed(2)}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-rule overflow-hidden" role="presentation">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${omitted ? 3 : Math.round((value ?? 0) * 100)}%` }} />
      </div>
    </div>
  );
}

export function Panel({ title, children, className = "", action }: { title?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={`rounded-2xl bg-paper text-ink p-4 sm:p-5 shadow-[0_1px_0_rgba(0,0,0,0.04),0_12px_40px_-20px_rgba(0,0,0,0.6)] ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-display text-lg uppercase tracking-wide">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export const QlooTag = () => (
  <span className="rounded bg-spot/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-spot-dim">Qloo</span>
);
