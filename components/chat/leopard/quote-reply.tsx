"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { QuoteIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { floating, mono } from "./surfaces";

// Selection popover for one assistant message: selecting text inside
// `containerRef` floats a small "Quote" pill above the selection; clicking it
// hands the quoted text to onQuote and clears the selection.
export function QuoteReply({
  containerRef,
  onQuote,
}: {
  containerRef: RefObject<HTMLElement | null>;
  onQuote: (text: string) => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number; text: string } | null>(
    null,
  );

  useEffect(() => {
    const onSelection = () => {
      const sel = window.getSelection();
      const root = containerRef.current;
      if (!sel || sel.isCollapsed || !root || sel.rangeCount === 0) {
        setPos(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        setPos(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        setPos(null);
        return;
      }
      const r = range.getBoundingClientRect();
      setPos({ x: r.left + r.width / 2, y: r.top, text });
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, [containerRef]);

  if (!pos) return null;

  return createPortal(
    <button
      type="button"
      style={{ left: pos.x, top: pos.y }}
      className={cn(
        floating,
        "fade-in zoom-in-95 animate-in fixed z-50 flex -translate-x-1/2 -translate-y-[calc(100%+8px)] items-center gap-1.5 rounded-full py-1.5 pl-2.5 pr-3 duration-150",
      )}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onQuote(pos.text);
        window.getSelection()?.removeAllRanges();
        setPos(null);
      }}
    >
      <QuoteIcon className="size-3 dark:text-[#ffb400] light:text-[#d49600]" />
      <span className={cn(mono, "dark:text-[#cfcfcf] light:text-[#404040]")}>
        Quote
      </span>
    </button>,
    document.body,
  );
}
