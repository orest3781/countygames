"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildDataset, dateKeyUTC, type CountiesPayload, type CountleState, type Dataset,
} from "@/lib/countle";
import { buildSession, submitGuess, type Session } from "@/lib/countle/session";
import { loadStateFrom, saveStateTo } from "@/lib/countle/persistence";

export function useCountle() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [state, setState] = useState<CountleState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [lastError, setLastError] = useState<string | null>(null);
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
        setState(loadStateFrom(window.localStorage));
        setStatus("ready");
      } catch (e) {
        if (!cancelled) { setLastError((e as Error).message); setStatus("error"); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const session: Session | null = useMemo(
    () => (dataset && state ? buildSession(dataset, state, dateKeyRef.current) : null),
    [dataset, state]
  );

  const guess = useCallback(
    (fips: string) => {
      if (!dataset || !state) return;
      const r = submitGuess(dataset, state, dateKeyRef.current, fips);
      if (!r.ok) { setLastError(r.reason); return; }
      setLastError(null);
      setState(r.state);
      saveStateTo(window.localStorage, r.state);
    },
    [dataset, state]
  );

  return { status, session, guess, lastError, dataset, state };
}
