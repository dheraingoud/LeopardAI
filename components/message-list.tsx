"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import Message, { ThinkingIndicator } from "@/components/message";
import type { QuickAction } from "@/lib/quick-actions";
import EmptyState from "@/components/empty-state";
import type { Artifact } from "@/types";

interface MessageListProps {
  messages: {
    _id?: string;
    role: "user" | "assistant" | "system";
    content: string;
    model?: string;
    createdAt: number;
  }[];
  isStreaming?: boolean;
  isThinking?: boolean;
  streamedContent?: string;
  onOpenArtifact?: (artifact: Artifact) => void;
  onRegenerate?: () => void;
  onQuickAction?: (action: QuickAction, code: string, lang: string) => void;
  userAvatar?: string;
  onEmptyStateSelect?: (prompt: string) => void;
}

export default function MessageList({
  messages,
  isStreaming,
  isThinking,
  streamedContent,
  onOpenArtifact,
  onRegenerate,
  onQuickAction,
  userAvatar,
  onEmptyStateSelect,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setIsAtBottom(distanceFromBottom < 100); // 100px threshold
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamedContent, isThinking, isAtBottom]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto overflow-x-hidden"
      style={{ minHeight: 0 }}
    >
      {/* Empty state when no messages */}
      {messages.length === 0 && onEmptyStateSelect ? (
        <EmptyState onSelect={onEmptyStateSelect} />
      ) : (
        <div className="max-w-3xl mx-auto px-8 py-8">
          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1;
            const isLastAssistant = isLast && msg.role === "assistant";

            return (
              <Message
                key={msg._id || `msg-${i}`}
                message={msg}
                index={i}
                isStreaming={isLastAssistant && isStreaming}
                streamedContent={
                  isLastAssistant && isStreaming ? streamedContent : undefined
                }
                onOpenArtifact={onOpenArtifact}
                onRegenerate={isLastAssistant ? onRegenerate : undefined}
                onQuickAction={onQuickAction}
                isLast={isLastAssistant}
                userAvatar={userAvatar}
              />
            );
          })}

          {/* Thinking indicator */}
          <AnimatePresence>
            {isThinking && <ThinkingIndicator />}
          </AnimatePresence>

          <div ref={bottomRef} className="h-32" />
        </div>
      )}
    </div>
  );
}
