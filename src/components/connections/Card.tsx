"use client";
import { PAPER, INK } from "@/components/countle/theme";

export default function Card({ label, selected, disabled, onClick }: {
  label: string; selected: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="animate-pop-in"
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
        aspectRatio: "1 / 1", padding: 6, borderRadius: 12, cursor: disabled ? "default" : "pointer",
        border: `2px solid ${selected ? INK : "rgba(36,29,18,0.14)"}`,
        background: selected ? INK : "#fffaf0",
        color: selected ? PAPER : INK,
        fontFamily: "var(--font-display)", fontSize: "clamp(11px, 3.2vw, 15px)", lineHeight: 1.05,
        fontWeight: 600, transition: "background 0.12s, color 0.12s, border-color 0.12s, transform 0.08s",
        transform: selected ? "translateY(1px)" : "none",
      }}
    >
      {label}
    </button>
  );
}
