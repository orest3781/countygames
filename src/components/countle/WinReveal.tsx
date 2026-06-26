"use client";
import { useState } from "react";
import type { Session } from "@/lib/countle/session";
import { regionColor, INK } from "./theme";

export default function WinReveal({ session }: { session: Session }) {
  const { mystery, solved, guessesUsed } = session;
  const color = regionColor(mystery.region);
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      await navigator.clipboard.writeText(session.shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="animate-modal-in" style={{ marginTop: 26, borderRadius: 22, overflow: "hidden",
      boxShadow: "0 12px 40px rgba(40,30,10,0.22)", background: "#fffaf0" }}>
      <div className="animate-wash-in" style={{ position: "relative", height: 200,
        background: mystery.hasArt ? "#000" : `linear-gradient(140deg, ${color}, ${color}cc)` }}>
        {mystery.hasArt && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/art/${mystery.fips}.png`} alt={mystery.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to top, ${color}ee, transparent 70%)` }} />
        <div style={{ position: "absolute", left: 18, bottom: 14, right: 18 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "#fff", lineHeight: 1.05, textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
            {mystery.name}
          </div>
          <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 14 }}>
            {mystery.county_seat ? `${mystery.county_seat} · ` : ""}{mystery.state_name}
          </div>
        </div>
      </div>

      <div style={{ padding: "18px 20px 22px" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: INK }}>
          {solved ? `Solved in ${guessesUsed}! 🔥 ${session.streak}` : `The answer was ${mystery.name}`}
        </div>
        {mystery.flavor && <div style={{ fontStyle: "italic", color: "#8a7d65", marginTop: 6, fontSize: 14 }}>"{mystery.flavor}"</div>}
        <button onClick={share}
          style={{ marginTop: 16, width: "100%", padding: "14px", borderRadius: 999, border: "none", cursor: "pointer",
            background: color, color: "#fff", fontFamily: "var(--font-display)", fontSize: 17 }}>
          {copied ? "Copied!" : "Share"}
        </button>
      </div>
    </div>
  );
}
