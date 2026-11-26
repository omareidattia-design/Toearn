"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import type { Language } from "@/lib/types";

interface AnalysisPopupProps {
  title: string;
  lang: Language;
  onClose: () => void;
  /** Element that opened the popup; focus returns to it without scrolling the page. */
  returnFocusRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * Coin analysis shown over the current view. The page underneath stays mounted and locked in place,
 * so closing the popup returns to the same tab, filters and scroll position.
 */
export default function AnalysisPopup({ title, lang, onClose, returnFocusRef, children }: AnalysisPopupProps) {
  const ar = lang === "ar";
  const panel = useRef<HTMLDivElement>(null);
  const pressedBackdrop = useRef(false);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);

  useEffect(() => {
    const root = document.documentElement;
    const previous = { overflow: root.style.overflow, gutter: root.style.scrollbarGutter };
    // Reserve the scrollbar's space while scrolling is locked, so the page behind does not shift sideways.
    if (window.innerWidth > root.clientWidth) root.style.scrollbarGutter = "stable";
    root.style.overflow = "hidden";
    panel.current?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      // The chart cancels its own tools on Escape first and marks the event as handled.
      if (event.key === "Escape" && !event.defaultPrevented && !document.fullscreenElement) close.current();
    };
    window.addEventListener("keydown", onKey);
    const opener = returnFocusRef.current;
    return () => {
      window.removeEventListener("keydown", onKey);
      root.style.overflow = previous.overflow;
      root.style.scrollbarGutter = previous.gutter;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [returnFocusRef]);

  return (
    <div
      className="fixed inset-0 z-[45] overflow-y-auto overscroll-contain bg-[#03060C]/85"
      onPointerDown={(event) => { pressedBackdrop.current = event.target === event.currentTarget; }}
      onClick={(event) => {
        // Close only for a press that both started and ended on the backdrop, never after a drag from inside.
        if (pressedBackdrop.current && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative mx-auto min-h-full w-full max-w-[1440px] bg-[#070B14] outline-none sm:my-5 sm:min-h-0 sm:rounded-2xl sm:border sm:border-[#1A2338] sm:shadow-2xl"
      >
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[#1A2338] bg-[#070B14] px-3 py-2.5 sm:rounded-t-2xl sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#0D1322] px-3 py-1.5 text-xs font-bold text-[#E2E8F0] hover:border-[#D4AF37]/60 hover:text-[#D4AF37]"
          >
            {ar ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
            <span>{ar ? "رجوع" : "Back"}</span>
          </button>
          <span className="min-w-0 truncate font-num text-xs font-bold text-[#94A3B8]" dir="ltr">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={ar ? "إغلاق نافذة التحليل" : "Close analysis"}
            className="cursor-pointer rounded-lg p-2 text-[#94A3B8] hover:bg-[#121A2D] hover:text-[#F8FAFC]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-3 py-4 sm:px-5">{children}</div>
      </div>
    </div>
  );
}
