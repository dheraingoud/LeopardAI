"use client";

import { useCallback, useRef, useState } from "react";

// Copy with isCopied auto-reset. Generation counter drops resolutions that
// land after unmount or after a newer copy — no setState on unmounted, no
// stale flag when the hook is reused. Rapid copies cancel the pending reset.
export function useCopyToClipboard(copiedDuration = 2000) {
  const [isCopied, setIsCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      if (!text || typeof navigator === "undefined" || !navigator.clipboard)
        return false;
      const gen = ++generationRef.current;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return false;
      }
      if (gen !== generationRef.current) return true; // superseded
      if (timerRef.current) clearTimeout(timerRef.current);
      setIsCopied(true);
      timerRef.current = setTimeout(() => {
        if (gen === generationRef.current) setIsCopied(false);
        timerRef.current = null;
      }, copiedDuration);
      return true;
    },
    [copiedDuration],
  );

  return { isCopied, copy };
}
