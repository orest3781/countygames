"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyGuess, buildWarmerSession, loadWarmerState, saveWarmerState, giveUp as giveUpState,
  type WarmerState, type WarmerSession,
} from "@/lib/warmer";
import { buildDataset, dateKeyUTC, type CountiesPayload, type Dataset } from "@/lib/countle";

export function useWarmer() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [state, setState] = useState<WarmerState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const dateKeyRef = useRef<string>(dateKeyUTC(new Date()));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/data/counties.json");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as CountiesPayload;
        if (cancelled) return;
        setDataset(buildDataset(payload));
        setState(loadWarmerState(window.localStorage));
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const session: WarmerSession | null = useMemo(
    () => (dataset && state ? buildWarmerSession(dataset, state, dateKeyRef.current) : null),
    [dataset, state]
  );

  const guess = useCallback((fips: string) => {
    if (!dataset || !state) return;
    const r = applyGuess(dataset, state, dateKeyRef.current, fips);
    if (!r.ok) {
      setNotice(
        r.reason === "duplicate" ? "Already guessed."
        : r.reason === "finished" ? "Today's puzzle is complete."
        : "Unknown county."
      );
      return;
    }
    setNotice(null);
    setState(r.state);
    saveWarmerState(window.localStorage, r.state);
  }, [dataset, state]);

  const giveUp = useCallback(() => {
    if (!dataset || !state) return;
    const next = giveUpState(state, dateKeyRef.current);
    setState(next);
    saveWarmerState(window.localStorage, next);
  }, [dataset, state]);

  return { status, session, dataset, state, guess, giveUp, notice };
}
