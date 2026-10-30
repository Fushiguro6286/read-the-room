import { ImageResponse } from "next/og";
import { loadShare } from "@/lib/share";

export const alt = "Read the Room result: Room Score before and after";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await loadShare(id);
  const a = run?.a;
  const swap = a?.references.find((r) => r.swap?.accepted);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "radial-gradient(ellipse at 50% -10%, #4a3512 0%, #161412 60%)", color: "#f3efe8", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: "#f5b335", letterSpacing: 4, textTransform: "uppercase", fontWeight: 800 }}>
          <span>Read the Room</span>
          <span style={{ color: "#bdb5a8", letterSpacing: 0, textTransform: "none", fontWeight: 400 }}>Powered by Qloo&apos;s taste graph</span>
        </div>
        {a ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 34, color: "#d8d1c5" }}>{`Tuned for ${a.room.label}`}</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 28, marginTop: 12 }}>
              <span style={{ fontSize: 120, color: "#7a7166", textDecoration: "line-through", fontWeight: 900 }}>{a.roomScoreBefore}</span>
              <span style={{ fontSize: 80, color: "#bdb5a8", paddingBottom: 24 }}>→</span>
              <span style={{ fontSize: 200, color: "#f5b335", fontWeight: 900, lineHeight: 1 }}>{a.roomScoreAfter}</span>
              <span style={{ fontSize: 30, color: "#bdb5a8", paddingBottom: 30 }}>Room Score</span>
            </div>
            {swap && (
              <div style={{ display: "flex", fontSize: 40, marginTop: 8 }}>
                <span style={{ color: "#ff8787", textDecoration: "line-through" }}>{swap.surface}</span>
                <span style={{ margin: "0 20px", color: "#bdb5a8" }}>→</span>
                <span style={{ color: "#8ce99a", fontWeight: 700 }}>{swap.swap!.entityName}</span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 64, fontWeight: 900 }}>Every joke, ad and speech is written for a room the writer has never been in.</div>
        )}
        <div style={{ fontSize: 24, color: "#8f877b" }}>Every swap is re-scored with Qloo before it&apos;s kept.</div>
      </div>
    ),
    size,
  );
}
