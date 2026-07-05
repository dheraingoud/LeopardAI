"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { X, ExternalLink, Sparkles, Send, ChevronDown, Square } from "lucide-react";
import MessageList from "@/components/message-list";
import { useStreaming } from "@/hooks/use-streaming";
import { MODELS } from "@/types";
import { useRouter } from "next/navigation";
import { applySlidingWindow } from "@/lib/context-manager";
import { estimateConversationTokens, getModelBudget } from "@/lib/token-estimator";
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";
import { persistImagesForMessage, sanitizeMessageForStorage } from "@/lib/image-cache";

interface SchemaChatOverlayProps {
  chatId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSendFirstMessage?: (message: string, modelId: string, options?: any) => Promise<void>;
  /** Hidden schema context injected as a system message — never shown in chat */
  schemaSystemContext?: string;
}

const SCHEMA_SYSTEM_PROMPT = `You are a senior SQL and database engineer AI assistant embedded in a schema visualization tool called Leopard. The user's current database schema is provided below in full. Use it to answer questions about joins, constraints, migrations, indexes, triggers, procedures, and data quality. Be precise with table/column references. Never ask the user to provide the schema — you already have it.\n\nRules:\n- Reference exact table and column names from the schema\n- Use fenced code blocks with \`\`\`sql for any SQL\n- Be concise but thorough\n- Prioritize migration safety, index optimization, and constraint correctness`;

// Only text models that are available
const SCHEMA_MODELS = MODELS.filter(m => m.modality === "text" && m.available);
const DEFAULT_SCHEMA_MODEL = SCHEMA_MODELS.find(m => m.id === "llama-3-70b") || SCHEMA_MODELS[0];

export default function SchemaChatOverlay({
  chatId,
  isOpen,
  onClose,
  onSendFirstMessage,
  schemaSystemContext,
}: SchemaChatOverlayProps) {
  const router = useRouter();
  const { user } = useUser();
  const [inputValue, setInputValue] = useState("");
  const [selectedModelId, setSelectedModelId] = useState(DEFAULT_SCHEMA_MODEL?.id || "llama-3-70b");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  const hasAutoStreamed = useRef(false);

  const chat = useQuery(api.chats.get, chatId ? { chatId: chatId as Id<"chats">, userId: user?.id } : "skip");
  const messages = useQuery(api.messages.list, chatId ? { chatId: chatId as Id<"chats"> } : "skip");
  const sendMessage = useMutation(api.messages.send);

  const { stream, isStreaming, isThinking, streamedContent, stopGeneration } = useStreaming({
    chatId: chatId as Id<"chats"> | undefined,
    userId: user?.id,
  });

  const selectedModel = useMemo(
    () => SCHEMA_MODELS.find(m => m.id === selectedModelId) || DEFAULT_SCHEMA_MODEL,
    [selectedModelId]
  );

  // Build the hidden context messages that gets prepended to every API call
  const buildContextMessages = useCallback(
    (userMessages: Array<{ role: string; content: string }>) => {
      const result: Array<{ role: string; content: string }> = [];

      if (schemaSystemContext) {
        result.push({
          role: "system",
          content: `${SCHEMA_SYSTEM_PROMPT}\n\n--- SCHEMA ---\n${schemaSystemContext}\n--- END SCHEMA ---`,
        });
      }

      result.push(...userMessages);
      return result;
    },
    [schemaSystemContext]
  );

  // Auto-stream when a new chat has exactly 1 user message
  useEffect(() => {
    if (
      isOpen &&
      messages &&
      messages.length === 1 &&
      messages[0].role === "user" &&
      !isStreaming &&
      !hasAutoStreamed.current &&
      chat
    ) {
      hasAutoStreamed.current = true;
      const modelToUse = selectedModel?.id || chat.model;
      const resolvedModel = MODELS.find((m) => m.id === modelToUse && m.available) || DEFAULT_SCHEMA_MODEL || MODELS[0];
      const contextMessages = buildContextMessages([{ role: "user", content: messages[0].content }]);
      stream(contextMessages, resolvedModel.id);
    }
  }, [messages, chat, isStreaming, stream, isOpen, buildContextMessages, selectedModel]);

  useEffect(() => {
    hasAutoStreamed.current = false;
  }, [chatId]);

  // ── Smart scroll: auto-scroll ONLY when user hasn't scrolled up ──
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUp.current = distFromBottom > 80;
  }, []);

  useEffect(() => {
    if (!userScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamedContent]);

  // Reset scroll lock when streaming finishes
  useEffect(() => {
    if (!isStreaming) {
      userScrolledUp.current = false;
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isStreaming]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 200);
  }, [isOpen]);

  // Close model picker on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    if (showModelPicker) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showModelPicker]);

  const handleSend = async () => {
    const question = inputValue.trim();
    if (!question || !user) return;

    setInputValue("");

    if (!chatId || !chat) {
      if (onSendFirstMessage) {
        await onSendFirstMessage(question, selectedModelId);
      }
      return;
    }

    const sanitized = sanitizeMessageForStorage(question);
    await sendMessage({
      chatId: chatId as Id<"chats">,
      userId: user.id,
      role: "user",
      content: sanitized.content,
    });

    if (sanitized.images.length > 0) {
      await persistImagesForMessage(String(chatId), sanitized.images);
    }

    const resolvedModel = MODELS.find((m) => m.id === selectedModelId && m.available) || DEFAULT_SCHEMA_MODEL || MODELS[0];
    const baseMessages = (messages || []).map((m) => ({ role: m.role, content: m.content }));
    const allMessages = [...baseMessages, { role: "user" as const, content: question }];
    const contextMessages = buildContextMessages(allMessages);

    const modelBudget = getModelBudget(resolvedModel.id);
    const estimatedTokens = estimateConversationTokens(contextMessages);
    const streamMessages = modelBudget > 0 && estimatedTokens > modelBudget
      ? applySlidingWindow(contextMessages, modelBudget).messages
      : contextMessages;

    stream(streamMessages, resolvedModel.id);
  };

  const handleRegenerate = async () => {
    if (!messages || !chat) return;
    const resolvedModel = MODELS.find((m) => m.id === selectedModelId && m.available) || DEFAULT_SCHEMA_MODEL || MODELS[0];
    const ctx = messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
    const contextMessages = buildContextMessages(ctx);
    stream(contextMessages, resolvedModel.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  const schemaTokens = schemaSystemContext ? Math.round(schemaSystemContext.length / 4) : 0;

  return (
    <div className="w-[420px] shrink-0 border-l border-border bg-background flex flex-col overflow-hidden transition-all duration-200">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-leopard-amber shrink-0" />
          <h3 className="font-semibold text-xs text-foreground truncate">DB Assistant</h3>
          {schemaTokens > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono shrink-0">
              {schemaTokens > 1000 ? `${(schemaTokens / 1000).toFixed(1)}K` : schemaTokens}t ctx
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => { if (chatId) router.push(`/app/chat/${chatId}`); }}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/50 transition-colors"
            title="Open in full chat"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/50 hover:text-destructive transition-colors"
            title="Close assistant"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-0"
      >
        {!chatId ? (
          <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center h-full gap-3">
            <div className="w-10 h-10 rounded-xl bg-leopard-amber/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-leopard-amber" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">Schema DB Assistant</p>
              <p className="text-xs mt-1.5 text-muted-foreground max-w-[280px] leading-relaxed">
                Ask about joins, missing indexes, migration risks, trigger logic, or any schema question.
                Your schema context is injected automatically.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3 max-w-[300px] justify-center">
              {["Missing indexes?", "Migration risks?", "Normalize this?", "Explain triggers"].map(q => (
                <button
                  key={q}
                  onClick={() => setInputValue(q)}
                  className="text-[10px] px-2 py-1 rounded-md border border-border bg-card hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : messages === undefined ? (
          <div className="p-6 text-center text-muted-foreground text-sm flex justify-center items-center h-full">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-leopard-amber rounded-full animate-pulse" />
              Loading conversation...
            </div>
          </div>
        ) : (
          <>
            <MessageList
              messages={messages}
              isStreaming={isStreaming}
              isThinking={isThinking}
              streamedContent={streamedContent}
              onRegenerate={handleRegenerate}
              userAvatar={user?.imageUrl}
              className="min-h-full pb-4"
            />
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* ── Input Area ── */}
      <div className="shrink-0 border-t border-border p-2.5 bg-card/30 space-y-2">
        {/* Model Selector */}
        <div className="relative" ref={modelPickerRef}>
          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors w-full justify-between border border-transparent hover:border-border"
          >
            <span className="truncate">{selectedModel?.name || "Select model"}</span>
            <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${showModelPicker ? "rotate-180" : ""}`} />
          </button>

          {showModelPicker && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-lg shadow-xl z-50 max-h-[240px] overflow-y-auto py-1">
              {SCHEMA_MODELS.map(model => (
                <button
                  key={model.id}
                  onClick={() => {
                    setSelectedModelId(model.id);
                    setShowModelPicker(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60 transition-colors flex items-center justify-between gap-2 ${
                    model.id === selectedModelId ? "bg-muted/40 text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <div className="min-w-0">
                    <span className="font-medium block truncate">{model.name}</span>
                    <span className="text-[9px] text-muted-foreground/70">{model.provider}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {model.badge && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-muted border border-border font-mono">
                        {model.badge}
                      </span>
                    )}
                    {model.id === selectedModelId && (
                      <span className="w-1.5 h-1.5 rounded-full bg-leopard-amber" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex items-end gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:border-leopard-amber/50 focus-within:ring-1 focus-within:ring-leopard-amber/20 transition-all">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this schema..."
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none min-h-[24px] max-h-[100px] leading-relaxed"
            style={{ fieldSizing: "content" as any }}
          />
          <button
            onClick={isStreaming ? stopGeneration : handleSend}
            disabled={!isStreaming && !inputValue.trim()}
            className={`shrink-0 p-1.5 rounded-md transition-all duration-150 ${
              isStreaming
                ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                : inputValue.trim()
                  ? "bg-leopard-amber text-black hover:bg-leopard-amber/80"
                  : "text-muted-foreground/30 cursor-not-allowed"
            }`}
            title={isStreaming ? "Stop generating" : "Send message"}
          >
            {isStreaming ? (
              <Square className="w-3 h-3 fill-current" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
