"use client";
import type { GuessResult } from "@/lib/countle";
import { INK } from "./theme";

export default function GuessHistory({ results }: { results: GuessResult[] }) {
  if (results.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {results.map((r, i) => (
        <div key={`${r.guess.fips}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
          <span style={{ flex: 1, fontWeight: 600, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {r.guess.name}, {r.guess.state_abbr}
          </span>
          <span style={{ letterSpacing: 1 }}>{r.shareRow}</span>
          <span style={{ width: 86, textAlign: "right", color: "#7c715c", fontVariantNumeric: "tabular-nums" }}>
            {r.isCorrect ? "🎯" : `${r.distanceMiles.toLocaleString("en-US")} mi ${r.compass.arrow}`}
          </span>
        </div>
      ))}
    </div>
  );
}
