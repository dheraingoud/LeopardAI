"use client";

import { useEffect } from "react";

/**
 * Last-resort route boundary for the chat surface (audit 2026-10-09: nothing
 * caught a render-level crash — one bad component blanked the app). Keeps the
 * chrome minimal and offers a recovery instead of a white page. Raw error
 * text is logged, never rendered.
 */
export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[chat-route]", error?.message, error?.digest);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-lg font-medium">Something broke while rendering this chat.</p>
      <p className="max-w-md text-sm dark:text-[#a3a3a3] light:text-[#525252]">
        Your conversations are safe — this is a display error, not lost data.
        Try reloading the view.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-[#ffb400] px-4 py-2 text-sm font-medium text-black hover:bg-[#ffb400]/90"
        >
          Try again
        </button>
        <a
          href="/chat"
          className="rounded-lg border border-foreground/[0.12] px-4 py-2 text-sm hover:bg-foreground/[0.05]"
        >
          New chat
        </a>
      </div>
    </div>
  );
}
