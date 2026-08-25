"use client";

import { ActiveChatProvider } from "@/hooks/use-active-chat";
import { ChatShell } from "@/components/chat/chat-shell";

/**
 * /chat — draft new chat. NO Convex row is minted up-front (that was the
 * empty-chat-on-every-visit bug): the provider mounts in "draft" mode, and the
 * first send creates the row then routes to /chat/<id> with the pending
 * message stashed (see use-active-chat's deferred-create branch). Landing on
 * /chat and leaving without typing leaves zero trace in the sidebar.
 */
export default function NewChatPage() {
  return (
    <ActiveChatProvider chatId="draft">
      <ChatShell />
    </ActiveChatProvider>
  );
}
