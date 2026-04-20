"use client";

import { useState, useCallback, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import {
  persistImagesForMessage,
  sanitizeMessageForStorage,
} from "@/lib/image-cache";

interface UseStreamingProps {
  chatId: Id<"chats">;
  userId?: string; // Optional userId for security verification
  onComplete?: (content: string) => void;
}

interface StreamMessage {
  role: string;
  content: string;
  imageUrls?: string[];
}

interface StreamOptions {
  imageAspectRatio?: "1:1" | "16:9" | "9:16" | "3:2" | "2:3" | "5:4" | "4:5";
}

interface VideoJobResponse {
  id: string;
  status: "queued" | "processing" | "done" | "failed";
  result?:
    | { kind: "video"; url: string }
    | { kind: "physics"; payload: string };
  error?: string;
}

async function getResponseErrorMessage(response: Response): Promise<string> {
  const fallback = `Request failed (${response.status})`;
  const raw = await response.text();
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown; code?: unknown };
    if (parsed.code === "CONTEXT_OVERFLOW") {
      return "__CONTEXT_OVERFLOW__";
    }
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error;
    }
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message;
    }
  } catch {
    // Fall back to raw text when upstream did not return JSON.
  }

  const text = raw.trim();
  if (!text) return fallback;
  return text.length > 240 ? `${text.slice(0, 240)}...` : text;
}

async function pollVideoJobResult(jobId: string): Promise<string> {
  const maxAttempts = 75;
  const waitMs = 4000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const res = await fetch(`/api/video-jobs/${jobId}`, { cache: "no-store" });
      if (res.ok) {
        const job = (await res.json()) as VideoJobResponse;

        if (job.status === "done" && job.result) {
          if (job.result.kind === "video") {
            return `---\n\nVideo job completed.\n\n[Video output](${job.result.url})`;
          }
          return `---\n\nVideo job completed.\n\n\`\`\`json\n${job.result.payload}\n\`\`\``;
        }

        if (job.status === "failed") {
          return `---\n\nVideo job failed.\n\nDetails: ${job.error || "Unknown processing error"}`;
        }
      }
    } catch {
      // Ignore transient poll failures and continue retrying.
    }

    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  return `---\n\nVideo job is still running. Use the status link above to check again.`;
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
    async (messages: StreamMessage[], modelId: string, options?: StreamOptions) => {
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
          body: JSON.stringify({
            messages,
            model: modelId,
            userId,
            imageOptions: options?.imageAspectRatio
              ? { aspectRatio: options.imageAspectRatio }
              : undefined,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const message = await getResponseErrorMessage(response);
          throw new Error(message);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader found");

        const decoder = new TextDecoder();
        let fullContent = "";
        let messageId: Id<"messages"> | null = null;
        let sseBuffer = "";
        let reachedDone = false;

        let lastUpdateTime = 0;
        const MIN_UPDATE_INTERVAL = 1800; // 1.8s between DB updates for max performance

        while (!reachedDone) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;

          // Normalize newlines so frame splitting remains stable across chunk boundaries.
          sseBuffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

          let frameEnd = sseBuffer.indexOf("\n\n");
          while (frameEnd !== -1) {
            const frame = sseBuffer.slice(0, frameEnd).trim();
            sseBuffer = sseBuffer.slice(frameEnd + 2);

            if (!frame) {
              frameEnd = sseBuffer.indexOf("\n\n");
              continue;
            }

            const data = frame
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n")
              .trim();

            if (!data) {
              frameEnd = sseBuffer.indexOf("\n\n");
              continue;
            }

            if (data === "[DONE]") {
              reachedDone = true;
              break;
            }

            try {
              const parsed = JSON.parse(data);
              // The proxy backend transforms the response to { content: "..." }
              // but we also support raw OpenAI-style { choices: [{ delta: { content: "..." } }] }
              let content = "";

              if (parsed.content !== undefined) {
                content = parsed.content;
              } else if (parsed.choices?.[0]?.delta?.content !== undefined) {
                content = parsed.choices[0].delta.content;
              }

              if (content) {
                if (isThinking) setIsThinking(false);
                fullContent += content;
                setStreamedContent(fullContent);

                // Create message in Convex if not exists.
                if (!messageId) {
                  const sanitized = sanitizeMessageForStorage(fullContent);
                  messageId = await sendMessage({
                    chatId,
                    userId, // Verify ownership on insert
                    role: "assistant",
                    content: sanitized.content,
                    model: modelId,
                  });

                  if (sanitized.images.length > 0) {
                    await persistImagesForMessage(String(messageId), sanitized.images);
                  }
                } else {
                  // Update Convex with debouncing.
                  const now = Date.now();
                  if (now - lastUpdateTime > MIN_UPDATE_INTERVAL) {
                    const sanitized = sanitizeMessageForStorage(fullContent);
                    await updateMessage({ messageId, content: sanitized.content });
                    if (sanitized.images.length > 0) {
                      await persistImagesForMessage(String(messageId), sanitized.images);
                    }
                    lastUpdateTime = now;
                  }
                }
              }
            } catch (error) {
              console.warn("[use-streaming] failed to parse SSE frame", {
                preview: data.slice(0, 160),
                error,
              });
            }

            frameEnd = sseBuffer.indexOf("\n\n");
          }
        }

        // Final update to guarantee consistency
        if (messageId) {
          const sanitized = sanitizeMessageForStorage(fullContent);
          await updateMessage({ messageId, content: sanitized.content });
          if (sanitized.images.length > 0) {
            await persistImagesForMessage(String(messageId), sanitized.images);
          }
        }

        await touchChat({ chatId });
        onComplete?.(fullContent);

        const queuedVideoJobMatch = fullContent.match(/\/api\/video-jobs\/([a-f0-9-]{16,})/i);
        if (messageId && queuedVideoJobMatch?.[1]) {
          void (async () => {
            const completion = await pollVideoJobResult(queuedVideoJobMatch[1]);
            const merged = `${fullContent}\n\n${completion}`;
            setStreamedContent(merged);

            const sanitized = sanitizeMessageForStorage(merged);
            await updateMessage({ messageId, content: sanitized.content });
            if (sanitized.images.length > 0) {
              await persistImagesForMessage(String(messageId), sanitized.images);
            }
            await touchChat({ chatId });
            onComplete?.(merged);
          })();
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Streaming error:", error);
        const msg = error instanceof Error ? error.message : "Something went wrong.";
      if (msg === "__CONTEXT_OVERFLOW__") {
        toast.error("Conversation too long for this model. Try starting a new chat or compact this conversation.", { duration: 8000 });
      } else {
        toast.error(msg);
      }
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
