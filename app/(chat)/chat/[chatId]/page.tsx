"use client";

import { useParams } from "next/navigation";
import { ActiveChatProvider } from "@/hooks/use-active-chat";
import { ChatShell } from "@/components/chat/chat-shell";

/**
 * /chat/[chatId] — existing chat. `chatId` is the Convex `_id` (sidebar
 * hard-codes it; the eager-create flow in /chat/page.tsx mints the row
 * up-front, so by the time we land here the row exists).
 *
 * Phase 5 replaced the interim useStreaming + MessageList + InputBar +
 * CanvasPanel surface with the AI SDK v6 useChat hook (client-side Convex
 * persistence — see use-active-chat) + a lean parts-based chat shell. The
 * provider is keyed by chatId so a chat switch is a clean remount (refs
 * reset). tools / artifacts / inline-gen land in Phase 6 / 8.
 */
export default function ChatPage() {
  const params = useParams();
  const chatId = params.chatId as string;

  return (
    <ActiveChatProvider key={chatId} chatId={chatId}>
      <ChatShell />
    </ActiveChatProvider>
  );
}
