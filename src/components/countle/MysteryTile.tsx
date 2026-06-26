"use client";
import type { CountyEntry } from "@/lib/countle";
import { regionColor } from "./theme";

export default function MysteryTile({ mystery, blur, finished }: { mystery: CountyEntry; blur: number; finished: boolean }) {
  const color = regionColor(mystery.region);
  const size = 132;
  if (mystery.hasArt && !finished) {
    return (
      <div style={{ width: size, height: size, borderRadius: 18, overflow: "hidden", boxShadow: "0 6px 18px rgba(40,30,10,0.18)", flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/art/${mystery.fips}.png`} alt="mystery county" width={size} height={size}
          style={{ width: "100%", height: "100%", objectFit: "cover", filter: `blur(${blur}px)`, transform: "scale(1.1)", transition: "filter 0.4s ease" }} />
      </div>
    );
  }
  // Art-less (or pre-reveal no-art) → region-color mystery card
  return (
    <div style={{ width: size, height: size, borderRadius: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
      background: `linear-gradient(140deg, ${color}, ${color}aa)`, boxShadow: "0 6px 18px rgba(40,30,10,0.18)" }}>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 46, color: "rgba(255,255,255,0.85)" }}>?</span>
    </div>
  );
}
