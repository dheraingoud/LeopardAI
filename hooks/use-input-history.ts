"use client";

import { useRef } from "react";
import type { ChatMessage } from "@/lib/types";

// Composer input history (aui unstable_useComposerInputHistory port,
// 2026-10-10): ArrowUp recalls the previously sent message, ArrowDown walks
// back to the live draft. Terminal idiom — fits the operator's keyboard-first
// workflow (Cmd+K / Cmd+/ / Cmd+Shift+C already exist). Disabled while the
// slash/mention menu is open (arrows already navigate it) and only at the
// text extremes: ArrowUp only from the FIRST line, ArrowDown only from the
// LAST, so mid-textarea caret motion is untouched.
//
// historyRef.current is a {index, draft} pair — index -1 = not browsing.
export function useInputHistory(messages: readonly ChatMessage[]) {
  const historyRef = useRef<{ index: number; draft: string }>({
    index: -1,
    draft: "",
  });

  // Newest-first user texts, most recent first. Memoized per render — the
  // handlers read it fresh, so no stale-closure recall.
  const history = messages
    .filter((m) => m.role === "user")
    .map((m) => m.parts.filter((p) => p.type === "text").map((p) => (p as { text?: string }).text ?? "").join("").trim())
    .filter((t) => t.length > 0)
    .reverse();

  /**
   * Attempt an ArrowUp/ArrowDown recall. Returns the text to load into the
   * composer, or undefined if the key shouldn't be intercepted (menu open,
   * caret mid-text, not at the boundary, or no history).
   */
  const tryRecall = (
    key: "ArrowUp" | "ArrowDown",
    currentText: string,
    caretAtFirstLine: boolean,
    caretAtLastLine: boolean,
  ): string | undefined => {
    if (history.length === 0) return undefined;
    const state = historyRef.current;

    if (key === "ArrowUp") {
      if (!caretAtFirstLine) return undefined;
      // Stash the in-progress draft once (first ArrowUp from the live draft).
      if (state.index === -1) state.draft = currentText;
      const next = Math.min(state.index + 1, history.length - 1);
      if (next === state.index) return undefined; // already at oldest
      state.index = next;
      return history[next];
    }

    // ArrowDown
    if (!caretAtLastLine) return undefined;
    if (state.index === -1) return undefined; // not browsing
    const next = state.index - 1;
    state.index = next;
    return next === -1 ? state.draft : history[next];
  };

  return { tryRecall };
}
