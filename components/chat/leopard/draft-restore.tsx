// Leopard fork of the elements kit draft-restore: unsent-draft persistence.
// Convex-backed — the draft lives on the chat row, so it follows the account.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useUserId } from "@/hooks/use-user-prefs";
import {
  applyServerDraft,
  editDraft,
  initialDraftState,
  markDraftWritten,
  type DraftState,
} from "@/lib/draft-sync";

const SAVE_DEBOUNCE_MS = 300;

export function useDraftRestore(chatId: string) {
  const userId = useUserId();
  const isDraft = chatId === "draft" || !/^[a-z0-9]{16,64}$/.test(chatId);
  const convexChatId = chatId as Id<"chats">;
  const saveDraft = useMutation(api.chats.saveDraft);
  const chat = useQuery(
    api.chats.get,
    isDraft || !userId ? "skip" : { chatId: convexChatId, userId },
  );
  const [draft, setDraftText] = useState("");
  const syncRef = useRef<DraftState>(initialDraftState());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback((next: DraftState) => {
    syncRef.current = next;
    setDraftText(next.value);
  }, []);

  const writeDraft = useCallback(
    (value: string) => {
      if (!userId || isDraft) return;
      void saveDraft({ chatId: convexChatId, userId, draft: value })
        .then(() => {
          commit(markDraftWritten(syncRef.current, value));
        })
        .catch((err) => {
          console.warn("[draft] persist failed:", err);
        });
    },
    [convexChatId, userId, isDraft, saveDraft, commit],
  );

  const scheduleWrite = useCallback(
    (value: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        writeDraft(value);
      }, SAVE_DEBOUNCE_MS);
    },
    [writeDraft],
  );

  useEffect(() => {
    if (isDraft || !chat) return;
    const before = syncRef.current;
    const next = applyServerDraft(before, chat.draft);
    if (next === before) return;
    commit(next);
    if (next.pending !== null) scheduleWrite(next.pending);
  }, [isDraft, chat, commit, scheduleWrite]);

  const setDraft = useCallback(
    (value: string) => {
      const next = editDraft(syncRef.current, value);
      commit(next);
      if (isDraft || !userId) return;
      if (!next.hydrated) return;
      scheduleWrite(value);
    },
    [isDraft, userId, commit, scheduleWrite],
  );

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const pending = syncRef.current.pending;
      if (pending === null || !userId || isDraft) return;
      void saveDraft({ chatId: convexChatId, userId, draft: pending }).catch(
        (err) => {
          console.warn("[draft] persist failed on unmount:", err);
        },
      );
    },
    [convexChatId, userId, isDraft, saveDraft],
  );

  return { draft, setDraft };
}
