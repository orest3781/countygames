"use client";
import { useState } from "react";
import { useCountle } from "./useCountle";
import Header from "./Header";
import MysteryTile from "./MysteryTile";
import StatBoard from "./StatBoard";
import CompassReadout from "./CompassReadout";
import GuessInput from "./GuessInput";
import GuessHistory from "./GuessHistory";
import WinReveal from "./WinReveal";
import Overlay from "./Overlay";
import CountyMap from "./CountyMap";
import StatsModal from "./StatsModal";
import { INK } from "./theme";
import HubLink from "@/components/hub/HubLink";

export default function CountleApp() {
  const { status, session, guess, dataset, state } = useCountle();
  const [overlay, setOverlay] = useState<null | "stats" | "map">(null);

  if (status !== "ready" || !session) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: INK }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>
          {status === "error" ? "Couldn't load today's puzzle." : "Loading…"}
        </span>
      </main>
    );
  }

  const { mystery } = session;
  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "28px 18px 80px" }}>
      <HubLink />
      <Header puzzleNumber={session.puzzleNumber} streak={session.streak} guessesLeft={session.guessesLeft}
        onOpenStats={() => setOverlay("stats")} onOpenMap={() => setOverlay("map")} />

      <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "22px 0 18px" }}>
        <MysteryTile mystery={mystery} blur={session.blur} finished={session.finished} />
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: INK }}>Today&apos;s mystery</div>
          <div style={{ color: "#7c715c", fontSize: 14 }}>Guess {session.guessesUsed + (session.finished ? 0 : 1)} of 6</div>
          {session.clueAvailable && mystery.notable_person && (
            <div style={{ marginTop: 8, fontSize: 13, color: "#b98a2e", maxWidth: 260 }}>
              💡 Clue: linked to <strong>{mystery.notable_person}</strong>
            </div>
          )}
        </div>
      </div>

      <StatBoard result={session.latest} />
      <div style={{ margin: "14px 0 18px" }}><CompassReadout result={session.latest} /></div>

      {!session.finished && dataset && (
        <div style={{ marginBottom: 22 }}>
          <GuessInput dataset={dataset} disabled={session.finished} onGuess={guess} />
        </div>
      )}

      <GuessHistory results={session.guessResults} />

      {session.finished && <WinReveal session={session} />}

      {overlay === "stats" && state && (
        <Overlay onClose={() => setOverlay(null)}><StatsModal state={state} /></Overlay>
      )}
      {overlay === "map" && dataset && state && (
        <Overlay wide onClose={() => setOverlay(null)}><CountyMap dataset={dataset} state={state} /></Overlay>
      )}
    </main>
  );
}
