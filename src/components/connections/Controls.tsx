"use client";
import { INK } from "@/components/countle/theme";

function PillButton({ label, onClick, disabled, primary }: {
  label: string; onClick: () => void; disabled?: boolean; primary?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "10px 18px", borderRadius: 999, fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700,
      cursor: disabled ? "default" : "pointer",
      border: `2px solid ${disabled ? "rgba(36,29,18,0.18)" : INK}`,
      background: primary && !disabled ? INK : "transparent",
      color: primary && !disabled ? "#f7f1e6" : disabled ? "rgba(36,29,18,0.35)" : INK,
      transition: "opacity 0.12s",
    }}>
      {label}
    </button>
  );
}

export default function Controls({ mistakesLeft, canSubmit, anySelected, onShuffle, onDeselect, onSubmit }: {
  mistakesLeft: number; canSubmit: boolean; anySelected: boolean;
  onShuffle: () => void; onDeselect: () => void; onSubmit: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#7c715c" }}>
        <span>Mistakes remaining:</span>
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{
              width: 12, height: 12, borderRadius: "50%",
              background: i < mistakesLeft ? INK : "rgba(36,29,18,0.18)",
            }} />
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <PillButton label="Shuffle" onClick={onShuffle} />
        <PillButton label="Deselect all" onClick={onDeselect} disabled={!anySelected} />
        <PillButton label="Submit" onClick={onSubmit} disabled={!canSubmit} primary />
      </div>
    </div>
  );
}
