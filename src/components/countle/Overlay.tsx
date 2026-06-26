"use client";
import { useEffect } from "react";
import type { ReactNode } from "react";

export default function Overlay({ onClose, wide, children }: { onClose: () => void; wide?: boolean; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div onClick={onClose} className="animate-fade-in"
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(36,29,18,0.45)",
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="animate-modal-in"
        style={{ background: "#fffaf0", borderRadius: 20, padding: "22px 22px 26px", width: "100%",
          maxWidth: wide ? 760 : 440, boxShadow: "0 18px 50px rgba(40,30,10,0.3)", position: "relative" }}>
        <button onClick={onClose} aria-label="Close"
          style={{ position: "absolute", top: 12, right: 14, border: "none", background: "transparent", fontSize: 22, cursor: "pointer", color: "#7c715c" }}>×</button>
        {children}
      </div>
    </div>
  );
}
