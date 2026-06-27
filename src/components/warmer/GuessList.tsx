"use client";
import type { GuessFeedback } from "@/lib/warmer";
import { TIER_HEX } from "./theme";
import { INK } from "@/components/countle/theme";

export default function GuessList({ guesses, labelOf }: { guesses: GuessFeedback[]; labelOf: (fips: string) => string }) {
  if (!guesses.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}>
      {guesses.map((g, i) => (
        <div key={g.fips} style={{
          display: "flex", alignItems: "center", gap: 10, borderRadius: 9, padding: "8px 12px",
          background: i === 0 ? "#fff4d6" : "#f4eede", border: i === 0 ? "1.5px solid #f0c98a" : "1.5px solid transparent",
        }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: TIER_HEX[g.tier], flexShrink: 0 }} />
          <span style={{ fontWeight: 700, color: INK, flex: 1 }}>{labelOf(g.fips)}</span>
          {g.tier === "found"
            ? <span style={{ color: "#15803d", fontWeight: 800 }}>Found!</span>
            : <span style={{ color: "#7c715c", fontVariantNumeric: "tabular-nums" }}>{g.miles.toLocaleString()} mi <span style={{ fontSize: 17 }}>{g.arrow}</span></span>}
        </div>
      ))}
    </div>
  );
}
