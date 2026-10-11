"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { mono, paper } from "./surfaces";

// Keyboard shortcuts reference — "?" (or Cmd/Ctrl+.) opens it. Rows mirror the
// live bindings: chat-shell (find/copy), command-palette-host (palette),
// composer (submit/stop/dictate), message edit (save/cancel).
const ROWS: ReadonlyArray<{ keys: string; action: string }> = [
  { keys: "⌘ K", action: "Command palette" },
  { keys: "⌘ F", action: "Find in conversation" },
  { keys: "⌘ ⇧ C", action: "Copy last response" },
  { keys: "⌘ ↵", action: "Send message" },
  { keys: "↑ / ↓", action: "Recall sent messages (at composer edge)" },
  { keys: "Esc", action: "Stop generating / close" },
  { keys: "⌘ .", action: "This panel" },
];

export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === ".") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // "?" when not typing in a field (Shift+/ on US layouts; some layouts
      // produce "?" without shift — accept either).
      if (e.key === "?" && !meta) {
        const el = document.activeElement;
        const typing =
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          (el instanceof HTMLElement && el.isContentEditable);
        if (!typing) {
          e.preventDefault();
          setOpen((v) => !v);
        }
        return;
      }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="absolute inset-0 backdrop-blur-[6px] dark:bg-black/60 light:bg-black/30"
            onClick={() => setOpen(false)}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            className={cn(
              paper,
              "relative flex w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl",
              "dark:shadow-[0_24px_80px_rgba(0,0,0,0.6)] light:shadow-[0_24px_80px_rgba(0,0,0,0.25)]",
            )}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <div className="flex h-12 items-center justify-between border-b px-4 dark:border-white/[0.07] light:border-black/[0.07]">
              <p className="text-[13px] font-medium dark:text-[#e5e5e5] light:text-[#262626]">
                Keyboard shortcuts
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close shortcuts"
                className="flex h-7 w-7 items-center justify-center rounded-md outline-none transition-colors dark:text-[#737373] light:text-[#8a8a8a] dark:hover:bg-white/[0.06] light:hover:bg-black/[0.05] dark:hover:text-white light:hover:text-black focus-visible:ring-1 focus-visible:ring-[#ffb400]/40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-col gap-0.5 p-2.5">
              {ROWS.map((r) => (
                <div
                  key={r.keys}
                  className="flex items-center justify-between rounded-lg px-2.5 py-2"
                >
                  <span className="text-[12.5px] dark:text-[#a3a3a3] light:text-[#525252]">
                    {r.action}
                  </span>
                  <span
                    className={cn(
                      mono,
                      "rounded-md border px-1.5 py-0.5 text-[10.5px] dark:border-white/[0.1] light:border-black/[0.1] dark:bg-white/[0.04] light:bg-black/[0.04] dark:text-[#d4d4d4] light:text-[#404040]",
                    )}
                  >
                    {r.keys}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
