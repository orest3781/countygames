"use client";
import { INK } from "./theme";

export default function Header({ puzzleNumber, streak, guessesLeft, onOpenStats, onOpenMap }: {
  puzzleNumber: number; streak: number; guessesLeft: number;
  onOpenStats?: () => void; onOpenMap?: () => void;
}) {
  const iconBtn = { border: "none", background: "transparent", cursor: "pointer", fontSize: 18, padding: 2 } as const;
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 40, margin: 0, letterSpacing: -0.5, color: INK }}>COUNTLE</h1>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#b98a2e" }}>#{puzzleNumber}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 15, color: INK }}>
        <span title="streak">🔥 {streak}</span>
        <span style={{ color: "#7c715c" }}>{guessesLeft} left</span>
        <button style={iconBtn} aria-label="Map" title="Your map" onClick={onOpenMap}>🗺️</button>
        <button style={iconBtn} aria-label="Statistics" title="Statistics" onClick={onOpenStats}>📊</button>
      </div>
    </div>
  );
}
