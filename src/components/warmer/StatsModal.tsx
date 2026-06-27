"use client";
import type { WarmerState } from "@/lib/warmer";
import { warmerStats } from "@/lib/warmer";
import { INK } from "@/components/countle/theme";

function Stat({ big, label }: { big: string | number; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: INK, lineHeight: 1 }}>{big}</div>
      <div style={{ fontSize: 11.5, color: "#8a7d65", marginTop: 3 }}>{label}</div>
    </div>
  );
}

export default function StatsModal({ state }: { state: WarmerState }) {
  const s = warmerStats(state);
  const max = Math.max(1, ...s.distribution.map((d) => d.count));
  return (
    <div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: INK, marginBottom: 14 }}>Statistics</div>
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 18 }}>
        <Stat big={s.played} label="played" />
        <Stat big={`${s.solvePct}%`} label="solved" />
        <Stat big={s.currentStreak} label="streak" />
        <Stat big={s.maxStreak} label="max" />
        <Stat big={s.best ?? "—"} label="best" />
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#5d5343", marginBottom: 8 }}>Guesses to solve</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {s.distribution.map((d) => (
          <div key={d.bucket} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 30, fontSize: 13, color: INK }}>{d.bucket}</span>
            <div style={{ flex: 1 }}>
              <div style={{ width: `${Math.max(6, (d.count / max) * 100)}%`, background: "#dc2626", color: "#fff",
                fontSize: 12, fontWeight: 700, textAlign: "right", padding: "2px 8px", borderRadius: 6, minWidth: 22 }}>
                {d.count}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
