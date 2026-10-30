"use client";
import { useEffect, useRef, useState } from "react";

function useCountUp(target: number, from: number) {
  const [v, setV] = useState(from);
  const prev = useRef(from);
  useEffect(() => {
    const start = prev.current;
    prev.current = target;
    const dur = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 1100;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = dur ? Math.min(1, (t - t0) / dur) : 1;
      setV(Math.round(start + (target - start) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

export function RoomScore({ before, after, known, compact }: { before: number; after: number; known: boolean; compact?: boolean }) {
  const shown = useCountUp(after, before);
  const tip = "Average Qloo affinity of the references for this room.";
  if (!known)
    return (
      <div title={tip}>
        <div className="font-display text-5xl text-unknown">—</div>
        <p className="mt-1 text-sm text-ink-soft">Qloo has no data for these references, so there is no score.</p>
      </div>
    );
  const delta = after - before;
  return (
    <div title={tip} aria-label={`Room Score ${before} before, ${after} after. ${tip}`}>
      <div className="flex items-end gap-3">
        <span className={`font-display leading-none text-ink-soft/60 line-through decoration-2 ${compact ? "text-3xl" : "text-4xl"}`}>{before}</span>
        <span aria-hidden className="pb-1 text-ink-soft">→</span>
        <span className={`font-display leading-none tabular-nums ${compact ? "text-6xl" : "text-7xl"} ${after >= 85 ? "text-strong" : after >= 70 ? "text-ok" : "text-weak"}`}>{shown}</span>
        {delta > 0 && <span className="mb-1 rounded-full bg-strong/10 px-2 py-0.5 text-sm font-bold text-strong">+{delta}</span>}
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        <span className="font-semibold uppercase tracking-wider">Room Score</span> · {tip}
      </p>
    </div>
  );
}
