"use client";
import { useEffect, useMemo, useState } from "react";
import { geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { GuessFeedback, HeatTier } from "@/lib/warmer";
import { TIER_HEX } from "./theme";

const UNGUESSED = "#efe9dc";

export default function WarmerMap({ guesses, closestFips }: { guesses: GuessFeedback[]; closestFips: string | null }) {
  const [topo, setTopo] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/counties-albers-10m.json")
      .then((r) => r.json())
      .then((t) => { if (!cancelled) setTopo(t); })
      .catch(() => { /* leave null → loading text */ });
    return () => { cancelled = true; };
  }, []);

  const tierByFips = useMemo(() => new Map<string, HeatTier>(guesses.map((g) => [g.fips, g.tier])), [guesses]);

  const rendered = useMemo(() => {
    if (!topo) return null;
    const path = geoPath();
    const counties = (feature(topo, topo.objects.counties) as any).features as any[];
    const statesMesh = path(mesh(topo, topo.objects.states, (a: any, b: any) => a !== b) as any) ?? "";
    let closestMark: { cx: number; cy: number } | null = null;
    const paths = counties.map((f) => {
      const fips = String(f.id).padStart(5, "0");
      const tier = tierByFips.get(fips);
      const isClosest = fips === closestFips;
      if (isClosest) { const [cx, cy] = path.centroid(f) as [number, number]; closestMark = { cx, cy }; }
      return (
        <path key={fips} d={path(f) ?? ""} fill={tier ? TIER_HEX[tier] : UNGUESSED}
          stroke={isClosest ? "#241d12" : "#fffaf0"} strokeWidth={isClosest ? 1.4 : 0.2} />
      );
    });
    return { paths, statesMesh, closestMark: closestMark as { cx: number; cy: number } | null };
  }, [topo, tierByFips, closestFips]);

  if (!rendered) {
    return <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", color: "#9b8f78" }}>Loading map…</div>;
  }
  return (
    <svg viewBox="0 0 975 610" style={{ width: "100%", height: "auto", display: "block" }}>
      <g>{rendered.paths}</g>
      <path d={rendered.statesMesh} fill="none" stroke="#fffaf0" strokeWidth={0.8} strokeLinejoin="round" />
      {rendered.closestMark && (
        <circle cx={rendered.closestMark.cx} cy={rendered.closestMark.cy} r={5} fill="none" stroke="#241d12" strokeWidth={1.6} />
      )}
    </svg>
  );
}
