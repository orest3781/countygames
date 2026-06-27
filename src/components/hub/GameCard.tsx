"use client";
import Link from "next/link";
import type { GameStatus, GameId } from "@/lib/hub/status";
import { INK } from "@/components/countle/theme";

function Motif({ id }: { id: GameId }) {
  if (id === "connections") {
    return (
      <div style={{ display: "flex", gap: 4 }}>
        {["#f2c14e", "#6fae53", "#5a8fd6", "#a96fc0"].map((c) => (
          <span key={c} style={{ width: 14, height: 14, borderRadius: 3, background: c, display: "inline-block" }} />
        ))}
      </div>
    );
  }
  if (id === "warmer") {
    return (
      <div style={{ display: "flex", gap: 4 }}>
        {["#93b4d6", "#fbbf24", "#f97316", "#dc2626"].map((c) => (
          <span key={c} style={{ width: 14, height: 14, borderRadius: 3, background: c, display: "inline-block" }} />
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
      {[10, 16, 8, 14, 12, 18].map((h, i) => (
        <span key={i} style={{ width: 8, height: h, borderRadius: 2, background: "#16a34a", display: "inline-block" }} />
      ))}
    </div>
  );
}

const CTA: Record<GameStatus["status"], string> = { new: "Play", playing: "Continue", done: "" };

export default function GameCard({ g }: { g: GameStatus }) {
  return (
    <Link href={g.href} style={{ textDecoration: "none", color: INK }}>
      <div style={{
        background: "#fffaf0", borderRadius: 18, border: "2px solid rgba(36,29,18,0.1)", borderLeft: `8px solid ${g.accent}`,
        padding: "18px 20px", boxShadow: "0 8px 24px rgba(40,30,10,0.06)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, margin: 0 }}>{g.name}</h2>
          <Motif id={g.id} />
        </div>
        <p style={{ color: "#7c715c", fontSize: 14, margin: "6px 0 12px" }}>{g.tagline}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 14 }}>
          <span title="streak">🔥 {g.streak}</span>
          <span style={{ marginLeft: "auto", fontWeight: 800, color: g.status === "done" ? "#15803d" : g.accent }}>
            {g.status === "done" ? `✓ ${g.resultLabel ?? ""}` : CTA[g.status]}
          </span>
        </div>
      </div>
    </Link>
  );
}
