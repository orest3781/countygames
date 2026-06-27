"use client";
import { useState } from "react";
import { useWarmer } from "./useWarmer";
import Header from "./Header";
import WarmerMap from "./WarmerMap";
import GuessList from "./GuessList";
import WinBanner from "./WinBanner";
import StatsModal from "./StatsModal";
import { TIER_HEX } from "./theme";
import GuessInput from "@/components/countle/GuessInput";
import Overlay from "@/components/countle/Overlay";
import { INK } from "@/components/countle/theme";
import HubLink from "@/components/hub/HubLink";

const SUFFIX = / (County|Parish|Borough|Census Area|Municipality|City and Borough|city)$/i;

export default function WarmerApp() {
  const { status, session, dataset, state, guess, giveUp, notice } = useWarmer();
  const [overlay, setOverlay] = useState<null | "stats">(null);

  if (status !== "ready" || !session || !dataset || !state) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: INK }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>
          {status === "error" ? "Couldn't load today's puzzle." : "Loading…"}
        </span>
      </main>
    );
  }

  const labelOf = (fips: string) => {
    const c = dataset.byFips.get(fips);
    return c ? `${c.name.replace(SUFFIX, "")}, ${c.state_abbr}` : fips;
  };

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "28px 18px 80px" }}>
      <HubLink />
      <Header puzzleNumber={session.puzzleNumber} streak={session.streak} guessCount={session.guessCount} onOpenStats={() => setOverlay("stats")} />
      <p style={{ color: "#7c715c", fontSize: 14, margin: "10px 0 14px" }}>
        Name any county — it lights up hot or cold. Find today&apos;s mystery county.
      </p>

      <WarmerMap guesses={session.guesses} closestFips={session.closest?.fips ?? null} />

      <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "center", color: "#7c715c", fontSize: 12, margin: "10px 0 16px" }}>
        cold
        <span style={{ width: 16, height: 13, borderRadius: 3, background: TIER_HEX.cold }} />
        <span style={{ width: 16, height: 13, borderRadius: 3, background: TIER_HEX.tepid }} />
        <span style={{ width: 16, height: 13, borderRadius: 3, background: TIER_HEX.warm }} />
        <span style={{ width: 16, height: 13, borderRadius: 3, background: TIER_HEX.hot }} />
        hot
      </div>

      {!session.finished && (
        <>
          <GuessInput dataset={dataset} disabled={false} onGuess={guess} />
          {notice && <div style={{ color: "#b45309", fontSize: 13, marginTop: 6, textAlign: "center" }}>{notice}</div>}
          {session.guessCount >= 1 && (
            <div style={{ textAlign: "center", marginTop: 10 }}>
              <button onClick={giveUp} style={{ border: "none", background: "transparent", color: "#9b8f78", fontSize: 13, textDecoration: "underline", cursor: "pointer" }}>
                give up
              </button>
            </div>
          )}
        </>
      )}

      <GuessList guesses={session.guesses} labelOf={labelOf} />

      {session.finished && <WinBanner session={session} />}

      {overlay === "stats" && (
        <Overlay onClose={() => setOverlay(null)}>
          <StatsModal state={state} />
        </Overlay>
      )}
    </main>
  );
}
