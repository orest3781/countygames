"use client";
import type { GuessResult, StatFeedback } from "@/lib/countle";
import { CLOSENESS_COLOR, STAT_LABELS, INK } from "./theme";

function arrowFor(f: StatFeedback): string {
  if (f.direction === "equal") return "=";
  const a = f.direction === "up" ? "↑" : "↓";
  return f.magnitude === 2 ? a + a : a;
}

export default function StatBoard({ result }: { result: GuessResult | null }) {
  const byKey = new Map((result?.stats ?? []).map((s) => [s.key, s]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {STAT_LABELS.map(({ key, label }) => {
        const f = byKey.get(key);
        const color = f ? CLOSENESS_COLOR[f.closeness] : "#d9d2c4";
        return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 82, fontSize: 13, fontWeight: 600, color: "#5d5343" }}>{label}</span>
            <div style={{ flex: 1, height: 16, background: "#efe9dc", borderRadius: 999, overflow: "hidden" }}>
              {f && (
                <div className="animate-bar-grow" key={`${key}-${f.guessValue}`}
                  style={{ width: `${f.guessValue}%`, height: "100%", background: color, borderRadius: 999 }} />
              )}
            </div>
            <span style={{ width: 34, textAlign: "right", fontFamily: "var(--font-display)", fontSize: 18,
              fontVariantNumeric: "tabular-nums", color: INK }}>{f ? f.guessValue : "—"}</span>
            <span style={{ width: 26, textAlign: "center", fontSize: 16, fontWeight: 800, color }}>{f ? arrowFor(f) : ""}</span>
          </div>
        );
      })}
    </div>
  );
}
