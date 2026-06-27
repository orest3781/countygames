"use client";
import { INK } from "@/components/countle/theme";

export default function Header({ puzzleNumber, streak, onOpenStats }: {
  puzzleNumber: number; streak: number; onOpenStats: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 38, margin: 0, letterSpacing: -0.5, color: INK }}>CONNECTIONS</h1>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#b98a2e" }}>#{puzzleNumber}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 15, color: INK }}>
        <span title="streak">🔥 {streak}</span>
        <button style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, padding: 2 }}
          aria-label="Statistics" title="Statistics" onClick={onOpenStats}>📊</button>
      </div>
    </div>
  );
}
