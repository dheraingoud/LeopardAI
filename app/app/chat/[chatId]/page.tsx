"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { motion } from "framer-motion";
import { Download, Share2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import MessageList from "@/components/message-list";
import InputBar from "@/components/input-bar";
import CanvasPanel from "@/components/canvas-panel";
import { useStreaming } from "@/hooks/use-streaming";
import { useSidebar } from "@/hooks/sidebar-context";
import { MODELS } from "@/types";
import type { Artifact } from "@/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { buildQuickActionPrompt, type QuickAction } from "@/lib/quick-actions";
import { persistImagesForMessage, sanitizeMessageForStorage } from "@/lib/image-cache";
import { applySlidingWindow } from "@/lib/context-manager";
import { useContextBudget } from "@/hooks/use-context-budget";
import { estimateConversationTokens, getModelBudget } from "@/lib/token-estimator";

interface SendOptions {
  inlineImages?: string[];
  imageAspectRatio?: "1:1" | "16:9" | "9:16" | "3:2" | "2:3" | "5:4" | "4:5";
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = params.chatId as string;
  const { user } = useUser();
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [nextContextOverride, setNextContextOverride] = useState<
    Array<{ role: "user" | "assistant" | "system"; content: string }> | null
  >(null);
  const { autoCollapse, restoreCollapse } = useSidebar();

  const hasAutoStreamed = useRef(false);

  // Queries
  const chat = useQuery(api.chats.get, {
    chatId: chatId as Id<"chats">,
    userId: user?.id
  });
  const messages = useQuery(api.messages.list, {
    chatId: chatId as Id<"chats">,
  });

  const contextBudget = useContextBudget({
    messages: (messages || []).map(m => ({ role: m.role, content: m.content })),
    modelId: chat?.model || "minimax-m2.5",
  });

  // Mutations
  const sendMessage = useMutation(api.messages.send);
  const updateTitle = useMutation(api.chats.updateTitle);
  const updateModel = useMutation(api.chats.updateModel);
  const shareChat = useMutation(api.chats.share);

  const { stream, isStreaming, isThinking, streamedContent, stopGeneration } =
    useStreaming({
      chatId: chatId as Id<"chats">,
      userId: user?.id,
      onComplete: async () => {
        if (!user) return;
        if (chat?.title === "New Chat" && messages && messages.length <= 2) {
          const firstMsg = messages.find((m) => m.role === "user");
          if (firstMsg) {
            try {
              const res = await fetch("/api/title", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: firstMsg.content }),
              });
              const data = await res.json();
              if (data.title) {
                await updateTitle({
                  chatId: chatId as Id<"chats">,
                  userId: user.id,
                  title: data.title,
                });
              }
            } catch {
              /* ignore */
            }
          }
        }
      },
    });

  // Auto-stream on first user message
  useEffect(() => {
    if (
      messages &&
      messages.length === 1 &&
      messages[0].role === "user" &&
      !isStreaming &&
      !hasAutoStreamed.current &&
      chat
    ) {
      hasAutoStreamed.current = true;
      const resolvedModel =
        MODELS.find((m) => m.id === chat.model && m.available) ||
        MODELS.find((m) => m.available) ||
        MODELS[0];
      stream(
        [{ role: "user", content: messages[0].content }],
        resolvedModel.id
      );
    }
  }, [messages, messages?.length, chat, isStreaming, stream]);

  // Reset guard on chat change
  useEffect(() => {
    hasAutoStreamed.current = false;
    // Reset artifact when navigating to new chat
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setArtifact(null);
    setNextContextOverride(null);
  }, [chatId]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Escape closes canvas
      if (e.key === "Escape" && artifact) {
        setArtifact(null);
        restoreCollapse();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [artifact, restoreCollapse]);

  // Canvas handlers
  const handleOpenArtifact = useCallback(
    (a: Artifact) => {
      setArtifact(a);
      autoCollapse();
    },
    [autoCollapse]
  );

  const handleCloseCanvas = useCallback(() => {
    setArtifact(null);
    restoreCollapse();
  }, [restoreCollapse]);

  // Export chat
  const handleExport = useCallback(() => {
    if (!messages || !chat) return;
    const lines: string[] = [
      `# ${chat.title}`,
      `*Exported from Leopard AI - ${new Date().toLocaleString()}*`,
      "",
      "---",
      "",
    ];
    for (const msg of messages) {
      const role = msg.role === "user" ? "**You**" : "**Leopard**";
      lines.push(`### ${role}`);
      lines.push("");
      lines.push(msg.content);
      lines.push("");
      lines.push("---");
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${chat.title.replace(/\s+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Chat exported as Markdown");
  }, [messages, chat]);

  // Share chat
  const handleShare = useCallback(async () => {
    if (!chat || !user) return;
    try {
      if (chat.shared && chat.shareId) {
        await navigator.clipboard.writeText(
          `${window.location.origin}/app/shared/${chat.shareId}`
        );
        toast.success("Share link copied!");
      } else {
        const shareId = await shareChat({
          chatId: chatId as Id<"chats">,
          userId: user.id
        });
        await navigator.clipboard.writeText(
          `${window.location.origin}/app/shared/${shareId}`
        );
        toast.success("Chat shared! Link copied.");
      }
    } catch {
      toast.error("Failed to share chat");
    }
  }, [chat, chatId, user, shareChat]);

  const handleCompact = useCallback(async () => {
    if (!messages || !chat) return;
    const tokenMessages = messages.map(m => ({ role: m.role, content: m.content }));
    const budget = contextBudget.maxTokens;
    const result = applySlidingWindow(tokenMessages, budget);
    if (result.droppedCount === 0) {
      setNextContextOverride(null);
      toast.info("Conversation is within context limits — no compaction needed.");
      return;
    }
    setNextContextOverride(result.messages as Array<{ role: "user" | "assistant" | "system"; content: string }>);
    toast.success(`Compacted: removed ${result.droppedCount} older messages, saved ~${Math.round((result.originalTokenCount - result.compactedTokenCount) / 1000)}K tokens for the next response.`);
  }, [messages, chat, contextBudget.maxTokens]);

  const handleSend = async (message: string, modelId: string, options?: SendOptions) => {
    if (!user) return;

    if (chat && modelId !== chat.model) {
      await updateModel({
        chatId: chatId as Id<"chats">,
        userId: user.id,
        model: modelId,
      });
    }

    const imageMarkdown = (options?.inlineImages || [])
      .map((url) => `![Attached image](${url})`)
      .join("\n\n");

    const contentForStorage = imageMarkdown
      ? `${message}\n\n${imageMarkdown}`.trim()
      : message;

    const sanitized = sanitizeMessageForStorage(contentForStorage);

    const userMessageId = await sendMessage({
      chatId: chatId as Id<"chats">,
      userId: user.id,
      role: "user",
      content: sanitized.content,
    });

    if (sanitized.images.length > 0) {
      await persistImagesForMessage(String(userMessageId), sanitized.images);
    }

    const baseMessages = nextContextOverride || (messages || []).map((m) => ({ role: m.role, content: m.content }));

    const allMessages = [
      ...baseMessages,
      {
        role: "user" as const,
        content: message,
        imageUrls: options?.inlineImages,
      },
    ];

    const modelBudget = getModelBudget(modelId);
    const estimatedTokens = estimateConversationTokens(allMessages);
    const streamMessages =
      modelBudget > 0 && estimatedTokens > modelBudget
        ? applySlidingWindow(allMessages, modelBudget).messages
        : allMessages;

    if (streamMessages.length < allMessages.length) {
      toast.message("Auto-compacted context for this send to avoid context window overflow.");
    }

    setNextContextOverride(null);
    stream(
      streamMessages,
      modelId,
      options?.imageAspectRatio ? { imageAspectRatio: options.imageAspectRatio } : undefined,
    );
  };

  const handleRegenerate = async () => {
    if (!messages || !chat) return;
    const resolvedModel =
      MODELS.find((m) => m.id === chat.model && m.available) ||
      MODELS.find((m) => m.available) ||
      MODELS[0];
    const ctx = nextContextOverride || messages
      .slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content }));

    const budget = getModelBudget(resolvedModel.id);
    const usage = estimateConversationTokens(ctx);
    const streamCtx = budget > 0 && usage > budget ? applySlidingWindow(ctx, budget).messages : ctx;

    setNextContextOverride(null);
    stream(streamCtx, resolvedModel.id);
  };

  // Quick action handler for Explain, Tests, Run buttons
  const handleQuickAction = useCallback(
    async (action: QuickAction, code: string, lang: string) => {
      if (!user || !chat) return;

      const prompt = buildQuickActionPrompt(action, code, lang);
      const resolvedModel =
        MODELS.find((m) => m.id === chat.model && m.available) ||
        MODELS.find((m) => m.available) ||
        MODELS[0];

      await sendMessage({
        chatId: chatId as Id<"chats">,
        userId: user.id,
        role: "user",
        content: prompt,
      });

      const allMessages = [
        ...(messages || []).map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: prompt },
      ];

      const budget = getModelBudget(resolvedModel.id);
      const usage = estimateConversationTokens(allMessages);
      const streamMessages = budget > 0 && usage > budget
        ? applySlidingWindow(allMessages, budget).messages
        : allMessages;

      stream(streamMessages, resolvedModel.id);
    },
    [user, chat, chatId, messages, sendMessage, stream]
  );

  // Handle empty state suggestion click
  const handleEmptyStateSelect = useCallback(
    async (prompt: string) => {
      if (!user || !chat) return;

      const resolvedModel =
        MODELS.find((m) => m.id === chat.model && m.available) ||
        MODELS.find((m) => m.available) ||
        MODELS[0];

      await sendMessage({
        chatId: chatId as Id<"chats">,
        userId: user.id,
        role: "user",
        content: prompt,
      });

      const allMessages = [
        ...(messages || []).map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: prompt },
      ];

      const budget = getModelBudget(resolvedModel.id);
      const usage = estimateConversationTokens(allMessages);
      const streamMessages = budget > 0 && usage > budget
        ? applySlidingWindow(allMessages, budget).messages
        : allMessages;

      stream(streamMessages, resolvedModel.id);
    },
    [user, chat, chatId, messages, sendMessage, stream]
  );

  // Loading state
  if (chat === undefined || messages === undefined) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-[3px]">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-[#ffb400]/40"
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </div>
          <p className="text-sm text-[#505050] font-body">
            Loading conversation…
          </p>
        </div>
      </div>
    );
  }

  // Not found/Unauthorized
  if (chat === null) {
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
            onClick={() => router.push('/app')}
          >
            Go back home
          </Button>
        </motion.div>
      </div>
    );
  }

  const currentModel =
    MODELS.find((m) => m.id === chat.model && m.available) ||
    MODELS.find((m) => m.available) ||
    MODELS[0];

  return (
    <div className="flex flex-1 min-h-0 bg-black">
      {/* Chat column */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-8 h-14 border-b border-white/[0.08] shrink-0 bg-[#020202]">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h2 className="text-sm font-body font-medium text-[#e5e5e5] truncate">
              {chat.title === "New Chat" ? "Start a conversation" : chat.title}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-body text-[#606060] bg-white/[0.02] px-2.5 py-1 rounded border border-white/[0.08] hidden sm:inline-flex uppercase tracking-tighter">
              {currentModel.name}
            </span>
            {/* Export button */}
            <button
              onClick={handleExport}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-[#505050] hover:text-[#e5e5e5] hover:bg-white/[0.06] transition-colors"
              title="Export as Markdown"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            {/* Share button */}
            <button
              onClick={handleShare}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-[#505050] hover:text-[#ffb400] hover:bg-[#ffb40008] transition-colors"
              title="Share chat"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
            {/* Compact button */}
            <button onClick={handleCompact} className={cn(
              "h-8 w-8 flex items-center justify-center rounded-lg transition-colors",
              contextBudget.isNearBudget ? "text-[#ffb400] bg-[#ffb40008] hover:bg-[#ffb40015]" : "text-[#505050] hover:text-[#a3a3a3] hover:bg-white/[0.06]"
            )}
              title="Compact conversation"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          isThinking={isThinking}
          streamedContent={streamedContent}
          onOpenArtifact={handleOpenArtifact}
          onRegenerate={handleRegenerate}
          onQuickAction={handleQuickAction}
          userAvatar={user?.imageUrl}
          onEmptyStateSelect={handleEmptyStateSelect}
        />

        {/* Floating Input */}
        <div className="absolute bottom-0 inset-x-0 z-20 p-4 sm:p-6 pointer-events-none">
          <div className="max-w-3xl mx-auto pointer-events-auto">
            <InputBar
              key={`${chatId}-${chat.model}`}
              onSend={handleSend}
              onStop={stopGeneration}
              onCompact={handleCompact}
              isStreaming={isStreaming}
              chatModel={chat.model}
              contextUsage={{
                percentUsed: contextBudget.percentUsed,
                usedTokens: contextBudget.usedTokens,
                maxTokens: contextBudget.maxTokens,
              }}
            />
          </div>
        </div>
      </div>

      {/* Canvas panel */}
      <CanvasPanel artifact={artifact} onClose={handleCloseCanvas} />
    </div>
  );
}