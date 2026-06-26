"use client";
import { useEffect, useMemo, useState } from "react";
import { geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { Dataset, CountleState } from "@/lib/countle";
import { regionProgress } from "@/lib/countle/collection";
import { regionColor, INK } from "./theme";

const ENCOUNTERED = "#d9d2c4";
const UNTOUCHED = "#efe9dc";

export default function CountyMap({ dataset, state }: { dataset: Dataset; state: CountleState }) {
  const [topo, setTopo] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/counties-albers-10m.json")
      .then((r) => r.json())
      .then((t) => { if (!cancelled) setTopo(t); })
      .catch(() => { /* leave null → loading text */ });
    return () => { cancelled = true; };
  }, []);

  const rendered = useMemo(() => {
    if (!topo) return null;
    const path = geoPath();
    const counties = (feature(topo, topo.objects.counties) as any).features as any[];
    const statesMesh = path(mesh(topo, topo.objects.states, (a: any, b: any) => a !== b) as any) ?? "";
    const solved = new Set(state.solvedCounties);
    const encountered = new Set(state.encounteredCounties);
    const paths = counties.map((f) => {
      const fips = String(f.id).padStart(5, "0");
      const fill = solved.has(fips)
        ? regionColor(dataset.byFips.get(fips)?.region ?? "Unknown")
        : encountered.has(fips)
        ? ENCOUNTERED
        : UNTOUCHED;
      return <path key={fips} d={path(f) ?? ""} fill={fill} stroke="#fffaf0" strokeWidth={0.2} />;
    });
    return { paths, statesMesh };
  }, [topo, state, dataset]);

  const rp = regionProgress(dataset, state);
  const totalSolved = state.solvedCounties.length;
  const totalPool = dataset.answerPoolFips.length;

  return (
    <div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: INK, marginBottom: 4 }}>Your map</div>
      <div style={{ color: "#7c715c", fontSize: 14, marginBottom: 12 }}>
        {totalSolved} / {totalPool} landmarks solved · {state.encounteredCounties.length} counties encountered
      </div>
      {!rendered ? (
        <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: "#9b8f78" }}>Loading map…</div>
      ) : (
        <svg viewBox="0 0 975 610" style={{ width: "100%", height: "auto", display: "block" }}>
          <g>{rendered.paths}</g>
          <path d={rendered.statesMesh} fill="none" stroke="#fffaf0" strokeWidth={0.8} strokeLinejoin="round" />
        </svg>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 12 }}>
        {rp.filter((r) => r.total > 0).map((r) => (
          <span key={r.region} style={{ fontSize: 12.5, color: INK }}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: regionColor(r.region), marginRight: 5, verticalAlign: "middle" }} />
            {r.region} {r.solved}/{r.total}
          </span>
        ))}
      </div>
    </div>
  );
}
