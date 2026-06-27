"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applySubmission, buildConnectionsView, loadConnectionsState, saveConnectionsState,
  type ConnectionsPayload, type ConnectionsState, type ConnectionsView,
} from "@/lib/connections";
import { buildDataset, dateKeyUTC, type CountiesPayload, type Dataset } from "@/lib/countle";

type SubmitOutcome = { kind: "correct" | "one-away" | "wrong" | "duplicate" } | null;

export function useConnections() {
  const [payload, setPayload] = useState<ConnectionsPayload | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [state, setState] = useState<ConnectionsState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<string[]>([]);
  const [displayOrder, setDisplayOrder] = useState<string[]>([]);
  const dateKeyRef = useRef<string>(dateKeyUTC(new Date()));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cRes, pRes] = await Promise.all([
          fetch("/data/counties.json"),
          fetch("/data/connections.json"),
        ]);
        if (!cRes.ok || !pRes.ok) throw new Error(`HTTP ${cRes.status}/${pRes.status}`);
        const counties = (await cRes.json()) as CountiesPayload;
        const conn = (await pRes.json()) as ConnectionsPayload;
        if (cancelled) return;
        const ds = buildDataset(counties);
        const st = loadConnectionsState(window.localStorage);
        setDataset(ds);
        setPayload(conn);
        setState(st);
        const v = buildConnectionsView(conn, ds, st, dateKeyRef.current);
        setDisplayOrder(v.remainingFips);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const view = useMemo(
    () => (payload && dataset && state ? buildConnectionsView(payload, dataset, state, dateKeyRef.current) : null),
    [payload, dataset, state]
  );

  const toggle = useCallback((fips: string) => {
    setSelected((cur) => {
      if (cur.includes(fips)) return cur.filter((f) => f !== fips);
      if (cur.length >= 4) return cur;
      return [...cur, fips];
    });
  }, []);

  const deselectAll = useCallback(() => setSelected([]), []);

  const shuffle = useCallback(() => {
    setDisplayOrder((cur) => {
      const a = [...cur];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    });
  }, []);

  const submit = useCallback((): SubmitOutcome => {
    if (!payload || !state || selected.length !== 4) return null;
    const fips4 = [...selected];
    const r = applySubmission(payload, state, dateKeyRef.current, fips4);
    if (!r.ok) {
      setSelected([]);
      return r.reason === "duplicate" ? { kind: "duplicate" } : null;
    }
    setState(r.state);
    saveConnectionsState(window.localStorage, r.state);
    if (r.result.kind === "correct") {
      // INVARIANT: solved fips are removed from displayOrder in the SAME tick `state`
      // updates, so `view.remainingFips` and `displayOrder` never diverge and a solved
      // card can't linger in the grid (which would make ConnectionsApp's labelOf fall
      // back to the raw fips). Any future "solve" path must preserve this co-update.
      const solved = new Set(fips4);
      setDisplayOrder((cur) => cur.filter((f) => !solved.has(f)));
    }
    setSelected([]);
    return { kind: r.result.kind };
  }, [payload, state, selected]);

  return { status, view, selected, displayOrder, toggle, submit, shuffle, deselectAll };
}
