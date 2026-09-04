"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { getModelById } from "@/lib/ai/models";
import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import { Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useActiveChat } from "@/hooks/use-active-chat";
import { BYPASS_CLERK, DEV_USER_ID } from "@/lib/dev-user";
import { getMessageText } from "./message";
import { Messages } from "./messages";
import { Composer } from "./leopard/composer";
import { ApprovalDock } from "./approval-dock";
import { ArtifactPanel } from "./artifact-panel";
import { GenerationLoader } from "./leopard/loading-state";
import { ConversationSearch, type SearchHit } from "./leopard/conversation-search";
import { Search } from "lucide-react";
import { SessionExpiryToast } from "./session-expiry-toast";
import { UsageReadout } from "./usage-readout";
import { TooltipIconButton } from "./leopard/primitives/tooltip-icon-button";
import { ConnectionDot } from "./leopard/connection-state";
import { HeaderQuotaBanner } from "./leopard/quota-banner";

/**
 * ChatShell — the per-chat surface injected into the (chat) layout's main
 * pane. Header (title + model badge + export/share) + Messages transcript +
 * floating Composer. Reads everything from useActiveChat. Φ6 mounts
 * the ArtifactPanel beside the transcript (renders null until a
 * createDocument tool call streams in — see use-active-chat.onData).
 */
export function ChatShell() {
  const { chatMeta, isLoading, isDraft, messages, currentModelId, status, serverStreaming } = useActiveChat();
  const { user } = useUser();
  const router = useRouter();
  // Clerk id, or DEV_USER_ID under BYPASS_CLERK (matches chat route + sidebar).
  const userId = user?.id ?? (BYPASS_CLERK ? DEV_USER_ID : null);
  const shareChat = useMutation(api.chats.share);
  const [shared, setShared] = useState(false);
  // Find-in-conversation (kit ConversationSearch): header magnifier toggles
  // the bar; hits come from message text; stepping scrolls the pair into view.
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const findHits = useMemo<SearchHit[]>(() => {
    const q = findQuery.trim().toLowerCase();
    if (!q) return [];
    const hits: SearchHit[] = [];
    messages.forEach((m, mi) => {
      const text = getMessageText(m);
      const at = text.toLowerCase().indexOf(q);
      if (at === -1) return;
      hits.push({
        id: m.id,
        before: text.slice(Math.max(0, at - 40), at),
        match: text.slice(at, at + q.length),
        after: text.slice(at + q.length, at + q.length + 40),
        position: mi,
      });
    });
    return hits;
  }, [messages, findQuery]);
  const scrollToHit = (idx: number) => {
    setFindIndex(idx);
    const hit = findHits[idx];
    if (!hit) return;
    // Pairs start at each user message — map the message index to its pair.
    const pairIndex = Math.max(
      0,
      messages.slice(0, hit.position + 1).filter((m) => m.role === "user")
        .length - 1,
    );
    document
      .querySelectorAll('[data-slot="message-pair"]')
      [pairIndex]?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  // Pending tool-approval → the composer zone swaps the input for the
  // ApprovalDock (user directive: the permission card replaces the input
  // box). Scans the trailing assistant message for a tool part in state
  // "approval-requested" (live SDK parts are `tool-<name>` typed).
  const pendingApproval = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") break;
      for (const p of (m.parts ?? []) as Array<Record<string, unknown>>) {
        const t = typeof p.type === "string" ? p.type : "";
        const isTool = t === "tool" || (t.startsWith("tool-") && t !== "tool-approval-request" && t !== "tool-approval-response");
        if (isTool && p.state === "approval-requested") {
          const approval = p.approval as { id?: string } | undefined;
          if (approval?.id) {
            // Wire parts may lack toolName — derive from the type suffix
            // ("tool-spawn_agents" → "spawn_agents"), same as the route's
            // resume resolver. Without this the dock showed "tool".
            const toolName =
              (p.toolName as string) ??
              (t.startsWith("tool-") && t !== "tool" ? t.slice(5) : undefined) ??
              "tool";
            return {
              approvalId: approval.id,
              toolName,
              input: p.input,
            };
          }
        }
      }
    }
    return null;
  }, [messages]);

  // QA loop-10: exporting right as a turn settles could capture the Convex
  // placeholder (empty assistant row) — the detached route finalizes the row a
  // beat AFTER the UI settles. If the trailing assistant message is empty,
  // wait once and rebuild from the freshest state before downloading.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const chatMetaRef = useRef(chatMeta);
  chatMetaRef.current = chatMeta;
  const exportRef = useRef<() => void>(() => {});

  const buildAndDownload = useCallback(() => {
    const meta = chatMetaRef.current;
    const msgs = messagesRef.current;
    if (!meta || msgs.length === 0) return;
    const lines: string[] = [
      `# ${meta.title}`,
      `*Exported from Leopard AI — ${new Date().toLocaleString()}*`,
      "",
      "---",
      "",
    ];
    for (const m of msgs) {
      const role = m.role === "user" ? "**You**" : "**Leopard**";
      // Attachments ride as file parts — export them as markers (base64 blobs
      // don't belong in markdown) so the transcript isn't silently lossy.
      const fileNotes = (m.parts ?? [])
        .filter((p) => p.type === "file")
        .map((p) => {
          const f = p as { filename?: string; mediaType?: string };
          return `[attachment: ${f.filename ?? "file"}${f.mediaType ? ` (${f.mediaType})` : ""}]`;
        });
      lines.push(`### ${role}`, "", ...fileNotes, getMessageText(m), "", "---", "");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${meta.title.replace(/\s+/g, "-").toLowerCase() || "chat"}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Chat exported as Markdown");
  }, []);

  const handleExport = useCallback(() => {
    if (!chatMetaRef.current || messagesRef.current.length === 0) return;
    const lastAssistant = [...messagesRef.current].reverse().find((m) => m.role === "assistant");
    const emptyPending =
      lastAssistant && !getMessageText(lastAssistant).trim();
    if (emptyPending) {
      // One deferred retry — covers the finalize lag without blocking exports
      // of chats that genuinely end on an empty reply.
      toast.info("Finishing the reply — export in a second…");
      setTimeout(() => exportRef.current(), 1500);
      return;
    }
    buildAndDownload();
  }, [buildAndDownload]);
  exportRef.current = handleExport;

  const handleShare = useCallback(async () => {
    if (!chatMeta || !userId) return;
    try {
      const shareUrl = chatMeta.shared && chatMeta.shareId
        ? `${window.location.origin}/share/${chatMeta.shareId}`
        : `${window.location.origin}/share/${await shareChat({ chatId: chatMeta._id, userId })}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied!");
      setShared(true);
    } catch {
      toast.error("Failed to share chat");
    }
  }, [chatMeta, user, shareChat]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <ChatBootLoader />
      </div>
    );
  }
  // Draft (/chat before first send): no Convex row — render the shell with a
  // bare header (no usage/export/share, they need a real chat row).
  if (isDraft) {
    return (
      <div role="presentation" className="relative flex flex-1 min-h-0 dark:bg-black light:bg-white">
        <SessionExpiryToast />
        <div className="flex-1 flex flex-col min-w-0 relative">
          <div className="flex items-center justify-between px-4 sm:px-8 h-14 border-b dark:border-white/[0.08] light:border-black/[0.08] shrink-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <h1 className="text-sm font-body font-medium dark:text-[#e5e5e5] light:text-[#262626] truncate">
                Start a conversation
              </h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ConnectionDot />
              <HeaderQuotaBanner />
            </div>
          </div>
          <Messages />
          {pendingApproval ? (
            <ApprovalDock
              approvalId={pendingApproval.approvalId}
              toolName={pendingApproval.toolName}
              input={pendingApproval.input}
            />
          ) : messages.length > 0 ? (
            <Composer />
          ) : null}
        </div>
        <ArtifactPanel />
      </div>
    );
  }
  if (!chatMeta) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center space-y-2"
        >
          <p className="text-[#606060] text-sm">Chat not found or private</p>
          <p className="text-[#303030] text-xs px-10">
            This conversation is either private or has been deleted.
          </p>
          <Button
            className="mt-6 h-8 text-[11px] font-mono bg-[#ffb400] text-black hover:bg-[#ffb400dd]"
            onClick={() => router.push("/chat")}
          >
            Go back home
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div role="presentation" className="relative flex flex-1 min-h-0 dark:bg-black light:bg-white">
      <SessionExpiryToast />
      <div className="flex-1 flex flex-col min-w-0 relative">
        <div className="flex items-center justify-between px-4 sm:px-8 h-14 border-b dark:border-white/[0.08] light:border-black/[0.08] shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h1 className="text-sm font-body font-medium dark:text-[#e5e5e5] light:text-[#262626] truncate">
              {chatMeta.title === "New Chat" ? "Start a conversation" : chatMeta.title}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ConnectionDot />
            <HeaderQuotaBanner />
            <button
              type="button"
              onClick={() => setFindOpen((o) => !o)}
              className="h-10 w-10 flex items-center justify-center rounded-lg text-[#737373] hover:text-[#ffb400] hover:bg-[#ffb400]/[0.06] transition-colors"
              title="Find in conversation"
              aria-expanded={findOpen}
            >
              <Search className="h-3.5 w-3.5" />
            </button>
            <UsageReadout chatId={chatMeta._id ?? undefined} />
            <TooltipIconButton
              tooltip="Export as Markdown"
              onClick={handleExport}
              className="h-10 w-10"
            >
              <Download className="h-3.5 w-3.5" />
            </TooltipIconButton>
            <TooltipIconButton
              tooltip={shared ? "Share link copied" : "Share chat"}
              onClick={handleShare}
              className="h-10 w-10"
            >
              <Share2 className="h-3.5 w-3.5" />
            </TooltipIconButton>
          </div>
        </div>

        {findOpen && (
          <div className="absolute right-4 top-16 z-30">
            <ConversationSearch
              query={findQuery}
              hits={findHits}
              activeIndex={findIndex}
              onQueryChange={(q) => {
                setFindQuery(q);
                setFindIndex(0);
              }}
              onStep={(d) =>
                scrollToHit(
                  (findIndex + d + Math.max(findHits.length, 1)) %
                    Math.max(findHits.length, 1),
                )
              }
            />
          </div>
        )}

        <Messages />
        {pendingApproval ? (
          <ApprovalDock
            approvalId={pendingApproval.approvalId}
            toolName={pendingApproval.toolName}
            input={pendingApproval.input}
          />
        ) : messages.length > 0 ? (
          <Composer />
        ) : null}
      </div>
      {/* Φ6: artifact side panel. Renders null until a createDocument tool
          streams data-* parts (see use-active-chat.onData). Slides in beside
          the transcript; closing drops state (doc was persisted on finish). */}
      <ArtifactPanel />
    </div>
  );
}


function ChatBootLoader() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 180);
    return () => clearInterval(id);
  }, []);
  return <GenerationLoader label="Loading chat" tick={tick} />;
}
