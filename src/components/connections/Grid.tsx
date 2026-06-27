"use client";
import type { ViewGroup } from "@/lib/connections";
import { GROUP_HEX, GROUP_TEXT } from "./theme";
import Card from "./Card";

export function SolvedBand({ group }: { group: ViewGroup }) {
  return (
    <div className="animate-pop-in" style={{
      background: GROUP_HEX[group.color], color: GROUP_TEXT, borderRadius: 12,
      padding: "10px 12px", textAlign: "center",
    }}>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 14, letterSpacing: 0.3, textTransform: "uppercase" }}>
        {group.label}
      </div>
      <div style={{ fontSize: 13, marginTop: 2, opacity: 0.85 }}>
        {group.cards.map((c) => c.label).join("  ·  ")}
      </div>
    </div>
  );
}

export default function Grid({ solvedGroups, displayOrder, labelOf, selected, disabled, onToggle }: {
  solvedGroups: ViewGroup[];
  displayOrder: string[];
  labelOf: (fips: string) => string;
  selected: string[];
  disabled: boolean;
  onToggle: (fips: string) => void;
}) {
  const sel = new Set(selected);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {solvedGroups.map((g) => <SolvedBand key={g.color} group={g} />)}
      {displayOrder.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {displayOrder.map((fips) => (
            <Card key={fips} label={labelOf(fips)} selected={sel.has(fips)}
              disabled={disabled} onClick={() => onToggle(fips)} />
          ))}
        </div>
      )}
    </div>
  );
}
