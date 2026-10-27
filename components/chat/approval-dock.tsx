"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useActiveChat } from "@/hooks/use-active-chat";
import { ApprovalCard } from "./leopard/approval-card";
import { AskUserCard } from "./leopard/ask-user-card";
import { PermissionGrant } from "./leopard/permission-grant";
import type { PendingApprovalGate } from "@/lib/ai/approval-gates";

/**
 * ApprovalDock — while tool calls await user approval, the composer zone
 * swaps the input box for THESE cards (user directive 2026-08-26: the
 * permission card replaces the input, not floats mid-transcript). Allow
 * (amber) / Deny (red) fire addToolApprovalResponse + an explicit resend
 * (the SDK only auto-resends with sendAutomaticallyWhen, which we don't set).
 *
 * A turn can gate several calls at once — one card per gate, so every gate is
 * answerable (2026-10-28: the dock showed only the first gate, the rest were
 * unreachable and the turn could never finish).
 *
 * After a decision, PermissionGrant flashes in place of that card until the
 * tool part flips to approval-responded and chat-shell unmounts the dock.
 * The inline AskCard in the transcript stays as the historical record.
 */
function GateCard({ gate }: { gate: PendingApprovalGate }) {
  const chat = useActiveChat();
  const [decided, setDecided] = useState<boolean | null>(null);
  // If the resume errored (stream crashed mid-resume), the part never flips to
  // approval-responded — the grant pill would latch forever with the composer
  // gone. Reset to the card so the user can answer again.
  const errored = !!chat.error;
  useEffect(() => {
    if (errored) setDecided(null);
  }, [errored]);

  // Human summary of the target (url / query / spawn task list), same shape
  // as the inline card.
  let target = "";
  if (gate.input && typeof gate.input === "object") {
    const o = gate.input as {
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

  const decide = (approved: boolean, reason?: string) => {
    if (decided !== null) return;
    setDecided(approved);
    try {
      // Provider-owned: the dock UNMOUNTS the moment the part flips to
      // approval-responded (pendingApprovals clears), killing any local poll —
      // the resume POST must live where the chat lives (2026-09-04: instant
      // approvals silently died here). The askUser card puts the chosen option
      // in `reason` so the resumed model reads it as the answer.
      chat.approveAndResume(gate.approvalId, approved, reason);
    } catch {
      /* surfaced via chat.error */
    }
  };

  // askUser gets the option card, not the binary Allow/Deny gate — the model
  // is asking a question with clickable choices. The pick resumes with the
  // choice as the tool's answer (approval.reason).
  const askInput =
    gate.toolName === "askUser" && gate.input && typeof gate.input === "object"
      ? (gate.input as { question?: string; options?: unknown })
      : null;
  const askOptions = Array.isArray(askInput?.options)
    ? (askInput.options as unknown[]).filter((o): o is string => typeof o === "string")
    : [];

  return (
    <AnimatePresence mode="wait">
      {decided === null ? (
        <motion.div
          key="card"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        >
          {askInput && askOptions.length > 0 ? (
            <AskUserCard
              question={askInput.question ?? ""}
              options={askOptions}
              onPick={(choice) => {
                // The choice is the tool's answer — approved:true with the
                // option in reason so the resumed model reads it.
                decide(true, choice);
              }}
              onSkip={() => decide(false)}
              className="dark:bg-[#0c0c0c]/90 light:bg-white/90 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)]"
            />
          ) : (
            <ApprovalCard
              toolName={gate.toolName}
              preview={target || undefined}
              onAllow={() => decide(true)}
              onDeny={() => decide(false)}
              className="dark:bg-[#0c0c0c]/90 light:bg-white/90 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)]"
            />
          )}
        </motion.div>
      ) : (
        <motion.div
          key="grant"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        >
          <PermissionGrant toolName={gate.toolName} granted={decided} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ApprovalDock({ gates }: { gates: PendingApprovalGate[] }) {
  return (
    <div className="absolute bottom-0 inset-x-0 z-20 p-4 sm:p-6 pointer-events-none">
      <div className="max-w-3xl mx-auto pointer-events-auto flex flex-col gap-2">
        {gates.map((gate) => (
          <GateCard key={gate.approvalId} gate={gate} />
        ))}
      </div>
    </div>
  );
}
