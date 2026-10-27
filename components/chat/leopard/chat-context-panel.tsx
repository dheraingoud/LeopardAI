"use client";

// leopard · per-chat context sheet — user-written notes plus the rolling
// summary of compacted turns, both stored per chat in Convex.

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { NotebookPenIcon, Trash2Icon } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useActiveChat } from "@/hooks/use-active-chat";
import { estimateTokens } from "@/lib/token-estimator";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ghostButton, mono } from "./surfaces";

const NOTES_MAX_CHARS = 8000;
const SAVE_DEBOUNCE_MS = 700;

export function ChatContextPanel() {
  const chat = useActiveChat();
  const chatId = chat.chatMeta?._id;
  const userId = chat.chatMeta?.userId;
  const ready = Boolean(chatId && userId);

  const row = useQuery(api.chatContext.get, ready ? { chatId: chatId!, userId: userId! } : "skip");
  const saveNotes = useMutation(api.chatContext.saveNotes);

  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const dirtyRef = useRef(false);
  const latestRef = useRef("");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (dirtyRef.current) return;
    setNotes(row?.notes ?? "");
  }, [row?.notes]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const persist = (value: string) => {
    if (!chatId || !userId) return;
    setStatus("saving");
    saveNotes({ chatId, userId, notes: value })
      .then(() => {
        if (latestRef.current === value) {
          dirtyRef.current = false;
          setStatus("saved");
        }
      })
      .catch(() => setStatus("idle"));
  };

  const onChange = (value: string) => {
    dirtyRef.current = true;
    latestRef.current = value;
    setNotes(value);
    setStatus("saving");
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      persist(latestRef.current);
    }, SAVE_DEBOUNCE_MS);
  };

  const clear = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    dirtyRef.current = true;
    latestRef.current = "";
    setNotes("");
    persist("");
  };

  const summary = row?.summary?.trim() ?? "";
  const summaryTokens = summary ? estimateTokens(summary) : 0;
  const notesTokens = notes.trim() ? estimateTokens(notes) : 0;
  const hasNotes = notes.trim().length > 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Chat context"
        title={hasNotes ? "Chat context — notes set" : "Chat context"}
        className={cn(
          ghostButton,
          "grid size-9 shrink-0 place-items-center rounded-full max-sm:size-11",
          hasNotes && "dark:text-[#ffb400] light:text-[#d49600]",
        )}
      >
        <NotebookPenIcon className="size-4" strokeWidth={1.5} />
        {hasNotes && (
          <span
            aria-hidden
            className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[#ffb400] light:bg-[#d49600]"
          />
        )}
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full max-w-[420px] gap-0 overflow-y-auto bg-[#141414] p-0 text-[#e5e5e5] sm:max-w-[420px] dark:border-white/10 light:bg-white light:text-[#262626]"
      >
        <SheetHeader className="border-b border-white/[0.06] px-5 py-4 dark:border-white/[0.06] light:border-black/[0.06]">
          <SheetTitle className="text-[15px] font-medium text-[#e5e5e5] light:text-[#262626]">
            Chat context
          </SheetTitle>
          <SheetDescription className="text-[12px] leading-relaxed text-[#8a8a8a] light:text-[#5a5a5a]">
            Notes you write here are injected into every prompt for this chat. The
            summary below is written by Leopard when older turns are compacted
            away.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-5 py-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="leopard-chat-notes"
                className="text-[12px] font-medium text-[#c9c9c9] light:text-[#3a3a3a]"
              >
                Your notes for this chat
              </label>
              <div className="flex items-center gap-2">
                <span className={cn(mono, "text-[#5a5a5a]")}>{notesTokens} tok</span>
                {status !== "idle" && (
                  <span className={cn(mono, "text-[#5a5a5a]")}>
                    {status === "saving" ? "saving…" : "saved"}
                  </span>
                )}
              </div>
            </div>
            <textarea
              id="leopard-chat-notes"
              value={notes}
              onChange={(e) => onChange(e.target.value)}
              maxLength={NOTES_MAX_CHARS}
              rows={7}
              placeholder="Standing instructions, preferences, and facts Leopard should keep in mind for this conversation."
              className="w-full resize-y rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] leading-relaxed text-[#e5e5e5] outline-none placeholder:text-[#5a5a5a] focus-visible:border-[#ffb400]/50 focus-visible:ring-1 focus-visible:ring-[#ffb400]/30 light:border-black/[0.08] light:bg-black/[0.03] light:text-[#262626] light:placeholder:text-[#9a9a9a]"
            />
            <div className="flex items-center justify-between gap-2">
              <span className={cn(mono, "text-[#5a5a5a]")}>
                {notes.length}/{NOTES_MAX_CHARS} chars
              </span>
              {hasNotes && (
                <button
                  type="button"
                  onClick={clear}
                  className={cn(
                    ghostButton,
                    "h-6 gap-1 px-2 text-[11px] hover:dark:text-red-300 hover:light:text-red-500",
                  )}
                >
                  <Trash2Icon className="size-3" strokeWidth={1.5} />
                  Clear notes
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-[#c9c9c9] light:text-[#3a3a3a]">
                Compacted summary
              </span>
              <span className={cn(mono, "text-[#5a5a5a]")}>
                {summary ? `${summaryTokens} tok` : "—"}
              </span>
            </div>
            {summary ? (
              <div className="max-h-[220px] overflow-y-auto rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap text-[#a3a3a3] light:border-black/[0.08] light:bg-black/[0.02] light:text-[#4a4a4a]">
                {summary}
              </div>
            ) : (
              <p className={cn(mono, "px-0.5 py-1 text-[#5a5a5a]")}>
                No compaction yet — nothing has been folded away.
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
