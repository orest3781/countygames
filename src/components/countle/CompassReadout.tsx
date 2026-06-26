"use client";
import type { GuessResult } from "@/lib/countle";
import { INK } from "./theme";

export default function CompassReadout({ result }: { result: GuessResult | null }) {
  if (!result || result.isCorrect) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, color: INK }}>
      <span style={{ fontSize: 24 }}>{result.compass.arrow}</span>
      <span style={{ fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums" }}>
        {result.distanceMiles.toLocaleString("en-US")} mi
      </span>
      <span style={{ color: "#7c715c" }}>{result.compass.label}</span>
    </div>
  );
}
