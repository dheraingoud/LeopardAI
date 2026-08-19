"use client";

import { useCallback, useState } from "react";
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
import { getMessageText } from "./message";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { ArtifactPanel } from "./artifact-panel";
import { PulseLoader } from "./pulse-loader";
import { SessionExpiryToast } from "./session-expiry-toast";
import { UsageReadout } from "./usage-readout";

/**
 * ChatShell — the per-chat surface injected into the (chat) layout's main
 * pane. Header (title + model badge + export/share) + Messages transcript +
 * floating MultimodalInput. Reads everything from useActiveChat. Φ6 mounts
 * the ArtifactPanel beside the transcript (renders null until a
 * createDocument tool call streams in — see use-active-chat.onData).
 */
export function ChatShell() {
  const { chatMeta, isLoading, messages, currentModelId } = useActiveChat();
  const { user } = useUser();
  const router = useRouter();
  const shareChat = useMutation(api.chats.share);
  const [shared, setShared] = useState(false);

  const handleExport = useCallback(() => {
    if (!chatMeta || messages.length === 0) return;
    const lines: string[] = [
      `# ${chatMeta.title}`,
      `*Exported from Leopard AI — ${new Date().toLocaleString()}*`,
      "",
      "---",
      "",
    ];
    for (const m of messages) {
      const role = m.role === "user" ? "**You**" : "**Leopard**";
      lines.push(`### ${role}`, "", getMessageText(m), "", "---", "");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${chatMeta.title.replace(/\s+/g, "-").toLowerCase() || "chat"}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Chat exported as Markdown");
  }, [chatMeta, messages]);

  const handleShare = useCallback(async () => {
    if (!chatMeta || !user) return;
    try {
      const shareUrl = chatMeta.shared && chatMeta.shareId
        ? `${window.location.origin}/share/${chatMeta.shareId}`
        : `${window.location.origin}/share/${await shareChat({ chatId: chatMeta._id, userId: user.id })}`;
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
        <PulseLoader size="lg" />
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
    <div className="relative flex flex-1 min-h-0 dark:bg-black light:bg-white">
      <SessionExpiryToast />
      <div className="flex-1 flex flex-col min-w-0 relative">
        <div className="flex items-center justify-between px-4 sm:px-8 h-14 border-b dark:border-white/[0.08] light:border-black/[0.08] shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h2 className="text-sm font-body font-medium dark:text-[#e5e5e5] light:text-[#262626] truncate">
              {chatMeta.title === "New Chat" ? "Start a conversation" : chatMeta.title}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ModelLabel modelId={currentModelId} />
            <UsageReadout chatId={chatMeta.id ?? undefined} />
            <button
              onClick={handleExport}
              className="h-10 w-10 flex items-center justify-center rounded-lg text-[#737373] hover:text-[#ffb400] hover:bg-[#ffb400]/[0.06] transition-colors"
              title="Export as Markdown"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleShare}
              className="h-10 w-10 flex items-center justify-center rounded-lg text-[#737373] hover:text-[#ffb400] hover:bg-[#ffb400]/[0.06] transition-colors"
              title={shared ? "Share link copied" : "Share chat"}
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <Messages />
        {messages.length === 0 && (
          /* Starter chips — fire `composer:set-text` so they reuse the same
             channel multimodal-input already listens on for the Edit-back-
             to-composer flow (see message.tsx handleEditUser + multimodal-
             input onSet). Hover/press fill the input + focus the textarea,
             no auto-send. */
          <div className="absolute inset-x-0 bottom-[124px] z-10 flex flex-wrap items-center justify-center gap-3 px-4 pointer-events-none">
            {["Summarize", "Sketch diagram", "Write tests"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("composer:set-text", {
                      detail: { text: s },
                    }),
                  )
                }
                className="pointer-events-auto rounded-full border border-amber-500/20 bg-amber-500/[0.04] px-4 py-2 font-mono text-sm text-amber-700 dark:text-amber-200 transition-colors hover:bg-amber-500/10 hover:border-amber-500/30"
              >
                {s}
             </button>
            ))}
         </div>
        )}
        <MultimodalInput />
      </div>
      {/* Φ6: artifact side panel. Renders null until a createDocument tool
          streams data-* parts (see use-active-chat.onData). Slides in beside
          the transcript; closing drops state (doc was persisted on finish). */}
      <ArtifactPanel />
    </div>
  );
}


function ModelLabel({ modelId }: { modelId: string }) {
  const m = getModelById(modelId);
  return (
    <span
      className="font-mono text-[12px] tracking-tight dark:text-[#909090] light:text-[#606060] tabular-nums"
      title={modelId}
    >
      {m?.name ?? modelId}
   </span>
  );
}
