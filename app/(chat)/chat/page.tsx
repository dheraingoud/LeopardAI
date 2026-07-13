"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { getDefaultChatModel } from "@/lib/ai/models";
import { BYPASS_CLERK, DEV_USER_ID } from "@/lib/dev-user";

/**
 * /chat — new chat. Creates the Convex chat row up-front (mirrors the existing
 * sidebar "New chat" behavior) then redirects to /chat/[chatId]. The
 * startedRef guard prevents a double-create under React StrictMode.
 *
 * Φ5 will swap this for the vercel-chatbot deferred-create flow (chat id minted
 * client-side, persisted on first message) once the AI SDK v6 transport lands.
 */
export default function NewChatPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const createChat = useMutation(api.chats.create);
  const startedRef = useRef(false);
  // TEMP: DEV_USER_ID fallback when BYPASS_CLERK is on (Phase 5 browser E2E).
  const effectiveUserId = user?.id ?? (BYPASS_CLERK ? DEV_USER_ID : null);

  useEffect(() => {
    if (!isLoaded || !effectiveUserId || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const id = await createChat({
        userId: effectiveUserId,
        title: "New Chat",
        model: getDefaultChatModel().id,
      });
      router.replace(`/chat/${id}`);
    })();
  }, [isLoaded, effectiveUserId, createChat, router]);

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex gap-[3px]">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-[#ffb400]/40 animate-pulse"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}
