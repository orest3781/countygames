"use client";
import { useMemo, useState } from "react";
import { searchCounties, type Dataset } from "@/lib/countle";
import { INK } from "./theme";

export default function GuessInput({ dataset, disabled, onGuess }: { dataset: Dataset; disabled: boolean; onGuess: (fips: string) => void; }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => (q.trim() ? searchCounties(dataset, q, 6) : []), [dataset, q]);

  function pick(fips: string) {
    onGuess(fips);
    setQ("");
    setActive(0);
  }

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        value={q}
        disabled={disabled}
        onChange={(e) => { setQ(e.target.value); setActive(0); }}
        onKeyDown={(e) => {
          if (!results.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); pick(results[active].fips); }
        }}
        placeholder="Name a county…"
        style={{
          width: "100%", padding: "14px 20px", fontSize: 17, borderRadius: 999,
          border: "2px solid rgba(36,29,18,0.15)", background: disabled ? "#efe9dc" : "#fffaf0",
          color: INK, outline: "none", fontFamily: "var(--font-sans)",
        }}
      />
      {results.length > 0 && !disabled && (
        <ul style={{ position: "absolute", zIndex: 20, top: 56, left: 0, right: 0, listStyle: "none", margin: 0, padding: 6,
          background: "#fffaf0", borderRadius: 16, boxShadow: "0 10px 30px rgba(40,30,10,0.18)" }}>
          {results.map((c, i) => (
            <li key={c.fips}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(c.fips)}
                style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "10px 14px",
                  borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left",
                  background: i === active ? "rgba(36,29,18,0.06)" : "transparent", color: INK, fontSize: 15 }}>
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                <span style={{ color: "#9b8f78" }}>{c.state_abbr}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
