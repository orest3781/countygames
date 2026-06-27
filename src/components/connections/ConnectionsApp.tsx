"use client";
import { useState } from "react";
import { useConnections } from "./useConnections";
import Header from "./Header";
import Grid from "./Grid";
import Controls from "./Controls";
import WinLose from "./WinLose";
import StatsModal from "./StatsModal";
import Overlay from "@/components/countle/Overlay";
import { INK } from "@/components/countle/theme";
import { loadConnectionsState } from "@/lib/connections";
import HubLink from "@/components/hub/HubLink";

export default function ConnectionsApp() {
  const { status, view, selected, displayOrder, toggle, submit, shuffle, deselectAll } = useConnections();
  const [overlay, setOverlay] = useState<null | "stats">(null);
  const [flash, setFlash] = useState<string | null>(null);

  if (status !== "ready" || !view) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: INK }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>
          {status === "error" ? "Couldn't load today's puzzle." : "Loading…"}
        </span>
      </main>
    );
  }

  const labelOf = (fips: string) =>
    view.unsolvedGroups.flatMap((g) => g.cards).find((c) => c.fips === fips)?.label ?? fips;

  const onSubmit = () => {
    const r = submit();
    if (!r) return;
    if (r.kind === "one-away") showFlash("One away…");
    else if (r.kind === "wrong") showFlash("Not a group.");
    else if (r.kind === "duplicate") showFlash("Already tried.");
  };
  const showFlash = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 1400); };

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "28px 18px 80px" }}>
      <HubLink />
      <Header puzzleNumber={view.puzzleNumber} streak={view.streak} onOpenStats={() => setOverlay("stats")} />
      <p style={{ color: "#7c715c", fontSize: 14, margin: "10px 0 18px" }}>
        Create four groups of four counties.
      </p>

      {!view.finished && (
        <>
          <div style={{ position: "relative" }}>
            {flash && (
              <div className="animate-fade-in" style={{
                position: "absolute", top: -34, left: "50%", transform: "translateX(-50%)", zIndex: 5,
                background: INK, color: "#f7f1e6", padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
              }}>{flash}</div>
            )}
            <Grid solvedGroups={view.solvedGroups} displayOrder={displayOrder} labelOf={labelOf}
              selected={selected} disabled={view.finished} onToggle={toggle} />
          </div>

          <Controls mistakesLeft={view.mistakesLeft} canSubmit={selected.length === 4}
            anySelected={selected.length > 0} onShuffle={shuffle} onDeselect={deselectAll} onSubmit={onSubmit} />
        </>
      )}

      {view.finished && <WinLose view={view} />}

      {overlay === "stats" && (
        <Overlay onClose={() => setOverlay(null)}>
          <StatsModal state={loadConnectionsState(window.localStorage)} />
        </Overlay>
      )}
    </main>
  );
}
