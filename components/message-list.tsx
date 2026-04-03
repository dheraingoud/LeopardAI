"use client";

import { useRef, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import Message, { ThinkingIndicator } from "@/components/message";
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
  userAvatar?: string;
}

export default function MessageList({
  messages,
  isStreaming,
  isThinking,
  streamedContent,
  onOpenArtifact,
  onRegenerate,
  userAvatar,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedContent, isThinking]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto overflow-x-hidden"
      style={{ minHeight: 0 }}
    >
      <div className="max-w-3xl mx-auto px-6 py-6">
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
              isLast={isLastAssistant}
              userAvatar={userAvatar}
            />
          );
        })}

        {/* Thinking indicator */}
        <AnimatePresence>
          {isThinking && <ThinkingIndicator />}
        </AnimatePresence>

        <div ref={bottomRef} className="h-4" />
      </div>
    </div>
  );
}
