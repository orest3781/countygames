"use client";
import { useState } from "react";
import type { WarmerSession } from "@/lib/warmer";
import { INK } from "@/components/countle/theme";

const SUFFIX = / (County|Parish|Borough|Census Area|Municipality|City and Borough|city)$/i;

export default function WinBanner({ session }: { session: WarmerSession }) {
  const [copied, setCopied] = useState(false);
  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(session.shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  };
  const t = session.target!;
  const bare = t.name.replace(SUFFIX, "");
  return (
    <div style={{ marginTop: 24, textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: INK }}>{session.solved ? "Found it!" : "Gave up"}</div>
      <div style={{ color: "#7c715c", fontSize: 15, margin: "4px 0 6px" }}>
        It was <strong style={{ color: INK }}>{bare}, {t.state_abbr}</strong>{t.county_seat ? ` · seat: ${t.county_seat}` : ""}
      </div>
      {session.solved && (
        <div style={{ color: "#15803d", fontWeight: 700, marginBottom: 14 }}>
          Solved in {session.guessCount} {session.guessCount === 1 ? "guess" : "guesses"} · streak {session.streak} 🔥
        </div>
      )}
      <button onClick={onShare} style={{
        padding: "12px 26px", borderRadius: 999, border: "none", background: INK, color: "#f7f1e6",
        fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: session.solved ? 0 : 10,
      }}>
        {copied ? "Copied!" : "Share"}
      </button>
    </div>
  );
}
