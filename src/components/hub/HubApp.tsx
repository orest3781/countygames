"use client";
import { useEffect, useState } from "react";
import { suiteStatus, type GameStatus } from "@/lib/hub/status";
import { dateKeyUTC } from "@/lib/countle";
import GameCard from "./GameCard";
import { INK } from "@/components/countle/theme";

// SSR-safe initial render: deterministic all-"new" status (no window access).
const INITIAL: GameStatus[] = suiteStatus({ getItem: () => null, setItem: () => {} }, "");

export default function HubApp() {
  const [games, setGames] = useState<GameStatus[]>(INITIAL);
  useEffect(() => {
    setGames(suiteStatus(window.localStorage, dateKeyUTC(new Date())));
  }, []);

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "40px 18px 80px" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 44, margin: 0, letterSpacing: -1, color: INK }}>COUNTY GAMES</h1>
      <p style={{ color: "#7c715c", fontSize: 16, margin: "6px 0 28px" }}>Three daily games on every US county.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {games.map((g) => <GameCard key={g.id} g={g} />)}
      </div>
    </main>
  );
}
