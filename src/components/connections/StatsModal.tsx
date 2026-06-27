"use client";
import type { ConnectionsState } from "@/lib/connections";
import { connectionsStats } from "@/lib/connections";
import { INK } from "@/components/countle/theme";

function Stat({ big, label }: { big: string | number; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 26, color: INK, lineHeight: 1 }}>{big}</div>
      <div style={{ fontSize: 11.5, color: "#8a7d65", marginTop: 3 }}>{label}</div>
    </div>
  );
}

export default function StatsModal({ state }: { state: ConnectionsState }) {
  const s = connectionsStats(state);
  return (
    <div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: INK, marginBottom: 14 }}>Statistics</div>
      <div style={{ display: "flex", justifyContent: "space-around" }}>
        <Stat big={s.played} label="played" />
        <Stat big={`${s.winPct}%`} label="win rate" />
        <Stat big={s.currentStreak} label="streak" />
        <Stat big={s.maxStreak} label="max streak" />
        <Stat big={s.perfect} label="perfect" />
      </div>
    </div>
  );
}
