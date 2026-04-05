"use client";
import { type ReactNode } from "react";

interface Props {
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
  fullScreenOnMobile?: boolean;
}

export default function OverlayShell({
  children,
  onClose,
  maxWidth = "max-w-lg",
  fullScreenOnMobile = false,
}: Props) {
  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Mobile: bottom sheet or full screen */}
      <div
        className={`sm:hidden absolute ${
          fullScreenOnMobile
            ? "inset-0"
            : "bottom-0 inset-x-0 max-h-[85vh] rounded-t-2xl"
        } bg-[#111827] overflow-y-auto animate-sheet-up`}
      >
        {!fullScreenOnMobile && (
          <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-[#111827] z-10">
            <div className="w-10 h-1 rounded-full bg-slate-600" />
          </div>
        )}
        {children}
      </div>

      {/* Desktop: centered modal */}
      <div className="hidden sm:flex absolute inset-0 items-center justify-center p-4">
        <div
          className={`relative z-10 w-full ${maxWidth} bg-[#111827] rounded-2xl overflow-y-auto max-h-[90vh] animate-modal-in`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
