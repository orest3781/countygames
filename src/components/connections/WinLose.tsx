"use client";
import { useState } from "react";
import type { ConnectionsView } from "@/lib/connections";
import { COLORS } from "@/lib/connections";
import { GROUP_HEX, GROUP_TEXT } from "./theme";
import { INK } from "@/components/countle/theme";

export default function WinLose({ view }: { view: ConnectionsView }) {
  const [copied, setCopied] = useState(false);
  // All four groups in canonical color order (solved + unsolved combined).
  const byColor = new Map([...view.solvedGroups, ...view.unsolvedGroups].map((g) => [g.color, g]));
  const ordered = COLORS.map((c) => byColor.get(c)!).filter(Boolean);

  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(view.shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div style={{ marginTop: 26, textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: INK, marginBottom: 4 }}>
        {view.won ? "Solved it!" : "Next time!"}
      </div>
      <div style={{ color: "#7c715c", fontSize: 14, marginBottom: 16 }}>
        {view.won ? `Streak ${view.streak} 🔥` : "Here were the four groups:"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {ordered.map((g) => (
          <div key={g.color} style={{ background: GROUP_HEX[g.color], color: GROUP_TEXT, borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 14, textTransform: "uppercase" }}>{g.label}</div>
            <div style={{ fontSize: 13, marginTop: 2, opacity: 0.85 }}>{g.cards.map((c) => c.label).join("  ·  ")}</div>
          </div>
        ))}
      </div>
      <button onClick={onShare} style={{
        padding: "12px 26px", borderRadius: 999, border: "none", background: INK, color: "#f7f1e6",
        fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, cursor: "pointer",
      }}>
        {copied ? "Copied!" : "Share"}
      </button>
    </div>
  );
}
