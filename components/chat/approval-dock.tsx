"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useActiveChat } from "@/hooks/use-active-chat";
import { ApprovalCard } from "./leopard/approval-card";
import { PermissionGrant } from "./leopard/permission-grant";

/**
 * ApprovalDock — while a tool call awaits user approval, the composer zone
 * swaps the input box for THIS card (user directive 2026-08-26: the
 * permission card replaces the input, not floats mid-transcript). Allow
 * (amber) / Deny (red) fire addToolApprovalResponse + an explicit resend
 * (the SDK only auto-resends with sendAutomaticallyWhen, which we don't set).
 *
 * After a decision, PermissionGrant flashes in place of the card until the
 * tool part flips to approval-responded and chat-shell unmounts the dock.
 * The inline AskCard in the transcript stays as the historical record.
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
  const [decided, setDecided] = useState<boolean | null>(null);

  // Human summary of the target (url / query / spawn task list), same shape
  // as the inline card.
  let target = "";
  if (input && typeof input === "object") {
    const o = input as {
      url?: string;
      query?: string;
      tasks?: Array<{ name?: string }>;
    };
    if (Array.isArray(o.tasks) && o.tasks.length > 0) {
      // spawn_agents: show the team the model wants to launch.
      target = `${o.tasks.length} tasks — ${o.tasks
        .map((t) => t.name ?? "agent")
        .join(", ")}`;
    } else {
      target = (o.url ?? o.query ?? "").replace(/^https?:\/\//, "");
    }
  }

  const decide = (approved: boolean) => {
    if (decided !== null) return;
    setDecided(approved);
    try {
      // Provider-owned: the dock UNMOUNTS the moment the part flips to
      // approval-responded (pendingApproval clears), killing any local poll —
      // the resume POST must live where the chat lives (2026-09-04: instant
      // approvals silently died here).
      chat.approveAndResume(approvalId, approved);
    } catch {
      /* surfaced via chat.error */
    }
  };

  return (
    <div className="absolute bottom-0 inset-x-0 z-20 p-4 sm:p-6 pointer-events-none">
      <div className="max-w-3xl mx-auto pointer-events-auto">
        <AnimatePresence mode="wait">
          {decided === null ? (
            <motion.div
              key="card"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            >
              <ApprovalCard
                toolName={toolName}
                preview={target || undefined}
                onAllow={() => decide(true)}
                onDeny={() => decide(false)}
                className="dark:bg-[#0c0c0c]/90 light:bg-white/90 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)]"
              />
            </motion.div>
          ) : (
            <motion.div
              key="grant"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            >
              <PermissionGrant toolName={toolName} granted={decided} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
