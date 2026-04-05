"use client";

import { useMemo, useState, useEffect } from "react";
import { type CountyCard } from "@/lib/supabase";
import { US_STATES, STATE_COUNTY_COUNTS } from "@/lib/store";

/* ------------------------------------------------------------------ */
/*  Tile-grid cartogram layout (row, col) for each state              */
/*  Approximates US geography in an 11-row x 12-col grid              */
/* ------------------------------------------------------------------ */

const GRID: { abbr: string; row: number; col: number }[] = [
  // Row 0: top-right New England
  { abbr: "ME", row: 0, col: 10 },

  // Row 1
  { abbr: "VT", row: 1, col: 9 },
  { abbr: "NH", row: 1, col: 10 },

  // Row 2: northern band
  { abbr: "WA", row: 2, col: 0 },
  { abbr: "MT", row: 2, col: 1 },
  { abbr: "ND", row: 2, col: 2 },
  { abbr: "MN", row: 2, col: 3 },
  { abbr: "WI", row: 2, col: 5 },
  { abbr: "MI", row: 2, col: 7 },
  { abbr: "NY", row: 2, col: 8 },
  { abbr: "MA", row: 2, col: 9 },
  { abbr: "RI", row: 2, col: 10 },
  { abbr: "CT", row: 2, col: 11 },

  // Row 3
  { abbr: "OR", row: 3, col: 0 },
  { abbr: "ID", row: 3, col: 1 },
  { abbr: "SD", row: 3, col: 2 },
  { abbr: "IA", row: 3, col: 3 },
  { abbr: "IL", row: 3, col: 5 },
  { abbr: "IN", row: 3, col: 6 },
  { abbr: "OH", row: 3, col: 7 },
  { abbr: "PA", row: 3, col: 8 },
  { abbr: "NJ", row: 3, col: 9 },

  // Row 4
  { abbr: "NV", row: 4, col: 0 },
  { abbr: "WY", row: 4, col: 1 },
  { abbr: "NE", row: 4, col: 2 },
  { abbr: "KS", row: 4, col: 3 },
  { abbr: "MO", row: 4, col: 4 },
  { abbr: "KY", row: 4, col: 5 },
  { abbr: "WV", row: 4, col: 6 },
  { abbr: "VA", row: 4, col: 7 },
  { abbr: "DE", row: 4, col: 9 },
  { abbr: "MD", row: 4, col: 10 },
  { abbr: "DC", row: 4, col: 11 },

  // Row 5
  { abbr: "CA", row: 5, col: 0 },
  { abbr: "UT", row: 5, col: 1 },
  { abbr: "CO", row: 5, col: 2 },
  { abbr: "OK", row: 5, col: 3 },
  { abbr: "AR", row: 5, col: 4 },
  { abbr: "TN", row: 5, col: 5 },
  { abbr: "NC", row: 5, col: 6 },
  { abbr: "SC", row: 5, col: 7 },

  // Row 6
  { abbr: "AZ", row: 6, col: 1 },
  { abbr: "NM", row: 6, col: 2 },
  { abbr: "TX", row: 6, col: 3 },
  { abbr: "LA", row: 6, col: 4 },
  { abbr: "MS", row: 6, col: 5 },
  { abbr: "AL", row: 6, col: 6 },
  { abbr: "GA", row: 6, col: 7 },

  // Row 7
  { abbr: "FL", row: 7, col: 7 },

  // Row 8: Alaska & Hawaii (spread apart, bottom)
  { abbr: "HI", row: 9, col: 0 },
  { abbr: "AK", row: 9, col: 6 },
];

const TOTAL_ROWS = 10;
const TOTAL_COLS = 12;

/* ------------------------------------------------------------------ */
/*  Color interpolation helper                                        */
/* ------------------------------------------------------------------ */

function lerp(a: string, b: string, t: number): string {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/*  Scale-to-fit constants                                            */
/* ------------------------------------------------------------------ */

const TILE_SIZE = 52;
const GAP = 4;
const MAP_NATIVE_WIDTH = TOTAL_COLS * TILE_SIZE + (TOTAL_COLS - 1) * GAP; // 668px

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

interface USMapProps {
  collection: CountyCard[];
  onStateClick: (stateAbbr: string) => void;
}

export default function USMap({ collection, onStateClick }: USMapProps) {
  // Scale-to-fit wrapper for mobile
  const [mapScale, setMapScale] = useState(1);

  useEffect(() => {
    function calc() {
      const vw = window.innerWidth - 32;
      setMapScale(vw < MAP_NATIVE_WIDTH ? vw / MAP_NATIVE_WIDTH : 1);
    }
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  // Build lookup: state_abbr -> owned cards
  const byState = useMemo(() => {
    const map: Record<string, CountyCard[]> = {};
    for (const card of collection) {
      if (!map[card.state_abbr]) map[card.state_abbr] = [];
      map[card.state_abbr].push(card);
    }
    return map;
  }, [collection]);

  return (
    <div className="w-full flex justify-center">
      <div
        style={{
          transform: `scale(${mapScale})`,
          transformOrigin: "top center",
          width: MAP_NATIVE_WIDTH,
        }}
      >
        <div
          className="relative"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${TOTAL_COLS}, ${TILE_SIZE}px)`,
            gridTemplateRows: `repeat(${TOTAL_ROWS}, ${TILE_SIZE}px)`,
            gap: `${GAP}px`,
          }}
        >
          {GRID.map((cell) => {
            const abbr = cell.abbr;
            const owned = byState[abbr]?.length ?? 0;
            const total = STATE_COUNTY_COUNTS[abbr] || 0;
            const pct = total > 0 ? owned / total : 0;

            return (
              <button
                key={abbr}
                onClick={() => onStateClick(abbr)}
                className="relative flex flex-col items-center justify-center rounded-lg border transition-all duration-200 hover:scale-110 hover:z-10 active:scale-95"
                title={`${US_STATES[abbr] || abbr}: ${owned}/${total} counties`}
                style={{
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  gridRow: cell.row + 1,
                  gridColumn: cell.col + 1,
                  background:
                    pct === 0
                      ? "#1e293b"
                      : pct >= 1
                        ? "linear-gradient(135deg, #f59e0b, #d97706)"
                        : `linear-gradient(135deg, ${lerp("#064e3b", "#059669", pct)}, ${lerp("#0a0e17", "#047857", pct)})`,
                  borderColor:
                    pct === 0
                      ? "#334155"
                      : pct >= 1
                        ? "#fbbf24"
                        : lerp("#065f46", "#34d399", pct),
                  boxShadow:
                    pct >= 1
                      ? "0 0 12px rgba(245,158,11,0.4)"
                      : pct >= 0.5
                        ? `0 0 8px rgba(16,185,129,${0.1 + pct * 0.2})`
                        : "none",
                }}
              >
                <span className="text-[13px] font-extrabold text-white leading-none">
                  {abbr}
                </span>
                <span
                  className={`text-[9px] font-mono leading-tight mt-0.5 ${
                    pct === 0
                      ? "text-slate-600"
                      : pct >= 1
                        ? "text-amber-100"
                        : "text-emerald-300/80"
                  }`}
                >
                  {owned}/{total}
                </span>

                {/* SVG progress ring for partial completion */}
                {pct > 0 && pct < 1 && (
                  <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox="0 0 52 52"
                  >
                    <circle
                      cx="26"
                      cy="26"
                      r="23"
                      fill="none"
                      stroke="rgba(16,185,129,0.15)"
                      strokeWidth="2"
                    />
                    <circle
                      cx="26"
                      cy="26"
                      r="23"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2"
                      strokeDasharray={`${pct * 144.5} 144.5`}
                      strokeLinecap="round"
                      transform="rotate(-90 26 26)"
                      className="transition-all duration-1000"
                    />
                  </svg>
                )}

                {/* Gold shimmer on complete */}
                {pct >= 1 && (
                  <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
