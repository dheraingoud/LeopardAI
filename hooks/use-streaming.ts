"use client";

import { useState, useCallback, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";

interface UseStreamingProps {
  chatId: Id<"chats">;
  userId?: string; // Optional userId for security verification
  onComplete?: (content: string) => void;
}

export function useStreaming({ chatId, userId, onComplete }: UseStreamingProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useMutation(api.messages.send);
  const updateMessage = useMutation(api.messages.update);
  const touchChat = useMutation(api.chats.touch);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setIsThinking(false);
  }, []);

  const stream = useCallback(
    async (messages: { role: string; content: string }[], modelId: string) => {
      // Basic validation
      if (!userId) {
        toast.error("User ID not found. Generation aborted.");
        return;
      }
      
      stopGeneration();
      setIsStreaming(true);
      setIsThinking(true);
      setStreamedContent("");

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, model: modelId }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || "Failed to fetch response");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader found");

        const decoder = new TextDecoder();
        let fullContent = "";
        let messageId: Id<"messages"> | null = null;
        
        let lastUpdateTime = 0;
        const MIN_UPDATE_INTERVAL = 1800; // 1.8s between DB updates for max performance

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") break;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || "";
                
                if (content) {
                  if (isThinking) setIsThinking(false);
                  fullContent += content;
                  setStreamedContent(fullContent);

                  // Create message in Convex if not exists
                  if (!messageId) {
                    messageId = await sendMessage({
                      chatId,
                      userId, // Verify ownership on insert
                      role: "assistant",
                      content: fullContent,
                      model: modelId,
                    });
                  } else {
                    // Update Convex with debouncing
                    const now = Date.now();
                    if (now - lastUpdateTime > MIN_UPDATE_INTERVAL) {
                      await updateMessage({ messageId, content: fullContent });
                      lastUpdateTime = now;
                    }
                  }
                }
              } catch (e) {
                /* chunk parsing failed, ignore */
              }
            }
          }
        }

        // Final update to guarantee consistency
        if (messageId) {
          await updateMessage({ messageId, content: fullContent });
        }
        
        await touchChat({ chatId });
        onComplete?.(fullContent);
      } catch (error: any) {
        if (error.name === "AbortError") return;
        console.error("Streaming error:", error);
        toast.error(error.message || "Something went wrong.");
      } finally {
        setIsStreaming(false);
        setIsThinking(false);
        abortControllerRef.current = null;
      }
    },
    [chatId, userId, sendMessage, updateMessage, touchChat, onComplete, stopGeneration, isThinking]
  );

  return {
    stream,
    isStreaming,
    isThinking,
    streamedContent,
    stopGeneration,
  };
}
