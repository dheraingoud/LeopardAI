// Leopard fork of the elements kit draft-restore: unsent-draft persistence.
// localStorage-backed, keyed per chat.
"use client";

import { useCallback, useEffect, useState } from "react";

const keyFor = (chatId: string) => `leopard-draft-${chatId}`;

// Persist the in-progress composer text: hydrate on mount/chat switch, write
// on every change, drop the key when the draft empties (i.e. on send).
export function useDraftRestore(chatId: string) {
  const key = keyFor(chatId);
  const [draft, setDraftState] = useState("");

  useEffect(() => {
    setDraftState(window.localStorage.getItem(key) ?? "");
  }, [key]);

  const setDraft = useCallback(
    (value: string) => {
      setDraftState(value);
      if (value === "") window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    },
    [key],
  );

  return { draft, setDraft };
}
