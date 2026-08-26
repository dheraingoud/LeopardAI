"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import { useActiveChat } from "@/hooks/use-active-chat";
import { cn } from "@/lib/utils";

/**
 * ApprovalDock — while a tool call awaits user approval, the composer zone
 * swaps the input box for THIS card (user directive 2026-08-26: the
 * permission card replaces the input, not floats mid-transcript). Allow
 * (amber) / Deny (neutral) fire addToolApprovalResponse + an explicit resend
 * (the SDK only auto-resends with sendAutomaticallyWhen, which we don't set).
 *
 * The inline AskCard in the transcript stays as the historical record; both
 * point at the same approval id, and whichever is answered first flips the
 * tool part to approval-responded — the other's buttons unmount with it.
 */
export function ApprovalDock({
  approvalId,
  toolName,
  input,
}: {
  approvalId: string;
  toolName: string;
  input?: unknown;
}) {
  const chat = useActiveChat();

  // Human summary of the target (url / query), same shape as the inline card.
  let target = "";
  if (input && typeof input === "object") {
    const o = input as { url?: string; query?: string };
    target = (o.url ?? o.query ?? "").replace(/^https?:\/\//, "");
  }

  const decide = (approved: boolean) => {
    try {
      (
        chat as unknown as {
          addToolApprovalResponse?: (r: { id: string; approved: boolean }) => void;
        }
      ).addToolApprovalResponse?.({ id: approvalId, approved });
      void chat.sendMessage();
    } catch {
      /* surfaced via chat.error */
    }
  };

  return (
    <div className="absolute bottom-0 inset-x-0 z-20 p-4 sm:p-6 pointer-events-none">
      <div className="max-w-3xl mx-auto pointer-events-auto">
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className={cn(
              "overflow-hidden rounded-2xl",
              "border dark:border-[#ffb400]/25 light:border-[#d49600]/30",
              "dark:bg-[#0c0c0c]/90 light:bg-white/90 backdrop-blur-xl",
              "shadow-[0_8px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)]",
            )}
          >
            <div className="flex flex-col gap-3 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="h-4 w-4 shrink-0 dark:text-[#ffb400] light:text-[#d49600]" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] dark:text-[#ffb400] light:text-[#b67f00]">
                  {toolName === "webSearch" ? "search access" : "web access request"}
                </span>
              </div>
              <p className="text-[13px] leading-[1.65] dark:text-[#c4c4c4] light:text-[#3d3d3d]">
                Leopard wants to run{" "}
                <code className="rounded dark:bg-[#ffb400]/10 light:bg-[#d49600]/10 px-1.5 py-px font-mono text-[12px] dark:text-[#ffb400] light:text-[#b67f00]">
                  {toolName}
                </code>
                {target && (
                  <>
                    {" on "}
                    <span className="font-mono text-[12px] break-all dark:text-[#e5e5e5] light:text-[#1d1d1f]">
                      {target}
                    </span>
                  </>
                )}
                . The response pauses until you decide.
              </p>
              <div className="flex items-center gap-2.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => decide(true)}
                  className="rounded-full bg-[#ffb400] px-5 py-2 text-[12px] font-semibold text-black transition-transform duration-150 active:scale-[0.97] hover:brightness-110"
                >
                  Allow
                </button>
                <button
                  type="button"
                  onClick={() => decide(false)}
                  className="rounded-full px-5 py-2 text-[12px] font-semibold dark:text-[#a3a3a3] light:text-[#525252] dark:bg-white/[0.06] light:bg-black/[0.05] transition-colors hover:dark:bg-white/[0.1] hover:light:bg-black/[0.08]"
                >
                  Deny
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
