"use client";
import type { CountleState } from "@/lib/countle";
import { statsSummary } from "@/lib/countle/collection";
import { INK } from "./theme";

function Stat({ big, label }: { big: string | number; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 26, color: INK, lineHeight: 1 }}>{big}</div>
      <div style={{ fontSize: 11.5, color: "#8a7d65", marginTop: 3 }}>{label}</div>
    </div>
  );
}

export default function StatsModal({ state }: { state: CountleState }) {
  const s = statsSummary(state);
  return (
    <div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: INK, marginBottom: 14 }}>Statistics</div>
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 20 }}>
        <Stat big={s.played} label="played" />
        <Stat big={`${s.winPct}%`} label="win rate" />
        <Stat big={s.currentStreak} label="streak" />
        <Stat big={s.maxStreak} label="max streak" />
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#5d5343", marginBottom: 8 }}>Guess distribution</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {s.distribution.map((count, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 14, fontSize: 13, color: INK, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
            <div style={{ flex: 1 }}>
              <div style={{ width: `${Math.max(6, (count / s.maxBucket) * 100)}%`, background: "#16a34a", color: "#fff",
                fontSize: 12, fontWeight: 700, textAlign: "right", padding: "2px 8px", borderRadius: 6, minWidth: 22 }}>
                {count}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
