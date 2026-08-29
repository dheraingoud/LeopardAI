"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { Send, Square, X } from "lucide-react";
import { useActiveChat } from "@/hooks/use-active-chat";
import { useSettingsStore } from "@/hooks/use-settings-store";
import { ModelSelectorCompact } from "./model-selector-compact";
import { PlusMenu } from "./plus-menu";
import { ContextDescriptor } from "./context-descriptor";
import { MemoryBadge } from "./memory-badge";
import { ResearchPanel } from "./research-panel";
import { uploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { getModelById } from "@/lib/ai/models";
import {
  getSkillsSnapshot,
  subscribeSkills,
} from "@/lib/skill-store";
import { getSlashMatches, SlashMenu, type SlashMatch } from "./slash-menu";
import {
  MentionMenu,
  useRecentChatTitles,
} from "./mention-menu";
import { applyMention, useMentionMatches } from "./leopard/composer";

/**
 * MultimodalInput — floating command bar. Plus-menu (vision-gated media attach,
 * file attach, skill add, mcp stub), borderless inline-right model selector,
 * context indicator between model and send, send/stop toggle. Sends AI SDK v6
 * parts (file parts + a text part); server convertToModelMessages handles them.
 * Vision gating + contextWindow arrive via /api/models capabilities[id].
 */
export function MultimodalInput() {
  const { sendMessage, status, stopGeneration, currentModelId } = useActiveChat();
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<
    { url: string; name: string; mediaType: string }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Slash-command + @-mention popovers ─────────────────────────────────────
  // Open is DERIVED from the input; Esc just suppresses the popover until the
  // next keystroke (so the user can keep typing "/..." or "@..." without it
  // re-popping). `activeIndex` resets whenever the open menu changes.
  const skills = useSyncExternalStore(subscribeSkills, getSkillsSnapshot);
  const chatTitles = useRecentChatTitles();
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState<"slash" | "mention" | null>(null);

  const slashValue = /^\/\w*$/.test(input) ? input : "";
  const slashMatches = useMemo(
    () => getSlashMatches(slashValue, skills),
    [slashValue, skills],
  );
  const slashOpen = dismissed !== "slash" && slashMatches.length > 0;

  const mentionPeople = useMemo(
    () => chatTitles.map((t) => ({ name: t, role: "agent" as const })),
    [chatTitles],
  );
  const mentionMatches = useMentionMatches(input, mentionPeople);
  const mentionOpen = dismissed !== "mention" && mentionMatches.length > 0;

  useEffect(() => setActiveIndex(0), [slashOpen, mentionOpen]);

  // Re-arm the popover once the user types again after an Esc dismiss.
  useEffect(() => {
    setDismissed(null);
  }, [input]);

  // Φ7 (Edit-back-to-composer): the action buttons on a user message
  // (message.tsx) dispatch this custom event to populate the composer + focus
  // it. Same-tab channel (CustomEvent won't survive to other tabs — a single
  // composer on screen, so this is exactly what we want, no BroadcastChannel
  // tax). The handler also auto-resizes the textarea so the inserted text
  // doesn't get clipped on a single-row box.
  useEffect(() => {
    function onSet(e: Event) {
      const text = (e as CustomEvent<{ text: string }>).detail?.text ?? "";
      setInput(text);
      setAttachments([]);
      // Focus + select after the textarea has updated to the new value.
      queueMicrotask(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        try {
          el.setSelectionRange(text.length, text.length);
        } catch {
          /* ignored — number input has no range */
        }
        // Trigger the autosize library to recompute rows.
        const ev = new Event("change", { bubbles: true });
        el.dispatchEvent(ev);
      });
    }
    window.addEventListener("composer:set-text", onSet);
    return () => window.removeEventListener("composer:set-text", onSet);
  }, []);

  // Capabilities straight from the client-imported registry (lib/ai/models) —
  // NOT /api/models. model-selector-compact reads the same registry, so the
  // input bar and the selector share one source of truth with zero network
  // round-trip (and no browser-cache staleness after a registry bump). The
  // ChatModel already carries supportsVision / contextWindow / reasoningConfig
  // / supportsReasoning, so the caps object is built here from the resolved
  // model — the route still reads /api/models server-side for isReasoningModel.
  const modelConfig = getModelById(currentModelId);
  const modelVision = modelConfig?.supportsVision ?? false;
  // Φ9: an image-edit model (e.g. qwen-image-edit) isn't a VLM but it accepts
  // an image attachment as edit input. Loosen the media gate so users can
  // attach — non-VLM image-edit still rejects non-image media in addFiles.
  const modelImageEdit = modelConfig?.supportsImageEdit ?? false;
  const ctxWin = modelConfig?.contextWindow;

  const sendWithEnter = useSettingsStore((s) => s.sendWithEnter);

  const isStreaming = status === "submitted" || status === "streaming";
  const hasContent = input.trim().length > 0 || attachments.length > 0;
  const canSend = hasContent && !isStreaming && !uploading;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const addFiles = async (files: FileList, kind: "media" | "file" | "skill") => {
    // Φ9: image-edit models (e.g. qwen-image-edit) aren't VLMs but still accept
    // images as edit input — relax the gate for media attaches.
    if (kind === "media" && !modelVision && !modelImageEdit) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        // image-edit is image-only by spec; refuse non-image media at the
        // input bar level so the route never sees a video + edit model.
        if (kind === "media" && modelImageEdit && !modelVision) {
          if (!f.type.startsWith("image/")) continue;
        }
        const up = await uploadFile(f);
        setAttachments((a) => [...a, { url: up.url, name: up.name, mediaType: up.mediaType }]);
      }
    } catch (e) {
      console.error("upload failed", e);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;
    const text = input.trim();
    const fileParts = attachments.map((a) => ({
      type: "file" as const,
      url: a.url,
      filename: a.name,
      mediaType: a.mediaType,
    }));
    const parts = [...fileParts, ...(text ? [{ type: "text" as const, text }] : [])];
    setInput("");
    setAttachments([]);
    void sendMessage({ parts } as never);
  };

  // Insert the chosen slash command ("/<slug> ") or mention ("@<title> "),
  // refocus the textarea, and place the caret at the end.
  const insertAndRefocus = (next: string) => {
    setInput(next);
    queueMicrotask(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      try {
        el.setSelectionRange(next.length, next.length);
      } catch {
        /* ignored — number input has no range */
      }
      const ev = new Event("change", { bubbles: true });
      el.dispatchEvent(ev);
    });
  };

  const selectSlash = (match: SlashMatch) => {
    insertAndRefocus(`/${match.slug} `);
  };
  const selectMention = (title: string) => {
    insertAndRefocus(applyMention(input, title));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const menuOpen = slashOpen || mentionOpen;
    const count = slashOpen ? slashMatches.length : mentionMatches.length;

    if (menuOpen && count > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % count);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + count) % count);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(slashOpen ? "slash" : "mention");
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing)) {
        e.preventDefault();
        if (slashOpen) selectSlash(slashMatches[activeIndex % count]);
        else selectMention(mentionMatches[activeIndex % count].name);
        return;
      }
    }

    // sendWithEnter=true (default): Enter sends, Shift+Enter newline.
    // sendWithEnter=false: Enter newline, Shift+Enter sends.
    const sendKey = sendWithEnter ? !e.shiftKey : e.shiftKey;
    if (e.key === "Enter" && sendKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="absolute bottom-0 inset-x-0 z-20 p-4 sm:p-6 pointer-events-none">
      <div className="max-w-3xl mx-auto pointer-events-auto">
        {(attachments.length > 0 || uploading) && (
          <div className="mb-2 flex flex-wrap gap-2 max-w-3xl mx-auto">
            {attachments.map((a, i) => (
              <div key={i} className="relative">
                {a.mediaType.startsWith("image/") ? (
                  <img
                    src={a.url}
                    alt={a.name}
                    className="h-16 w-16 object-cover rounded-lg border dark:border-white/[0.08] light:border-black/[0.08]"
                  />
                ) : (
                  <div className="h-16 w-16 flex flex-col items-center justify-center rounded-lg border dark:border-white/[0.08] light:border-black/[0.08] dark:bg-white/[0.03] light:bg-black/[0.03] px-1 text-center">
                    <span className="text-[9px] font-mono dark:text-[#a3a3a3] light:text-[#525252] truncate w-full">
                      {a.name}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setAttachments((arr) => arr.filter((_, idx) => idx !== i))
                  }
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center rounded-full dark:bg-[#0c0c0c] light:bg-white border dark:border-white/20 light:border-black/20 dark:text-[#a3a3a3] light:text-[#525252] hover:!text-[#ffb400] transition-colors"
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {uploading && (
              <span className="self-center text-[10px] font-mono dark:text-[#ffb400]/70 light:text-[#d49600]/80">
                uploading…
              </span>
            )}
          </div>
        )}
        <form
          onSubmit={handleSubmit}
          className="group relative rounded-[1.75rem] ring-1 ring-white/5 dark:ring-white/5 light:ring-black/5 p-1.5 transition-shadow focus-within:ring-[#ffb400]/40"
        >
          {slashOpen && (
            <SlashMenu
              matches={slashMatches}
              activeIndex={activeIndex % slashMatches.length}
              onSelect={selectSlash}
            />
          )}
          {mentionOpen && (
            <MentionMenu
              titles={mentionMatches.map((m) => m.name)}
              activeIndex={activeIndex % mentionMatches.length}
              onSelect={selectMention}
            />
          )}
          {/* Solid field surface (DESIGN.md): opaque aui-style composer. */}
          <div className="rounded-[1.375rem] dark:bg-[#141414] light:bg-white border dark:border-white/10 light:border-black/10 shadow-[0_8px_30px_rgba(0,0,0,0.35)] light:shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
            <div className="relative flex items-end gap-1.5 px-2 py-2 h-full w-full">
              <PlusMenu
                modelVision={modelVision}
                modelImageEdit={modelImageEdit}
                onPickMedia={(f) => addFiles(f, "media")}
                onPickFile={(f) => addFiles(f, "file")}
                onPickSkill={(f) => addFiles(f, "skill")}
              />
              <TextareaAutosize
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Leopard…"
                rows={1}
                minRows={1}
                maxRows={8}
                className="flex-1 resize-none bg-transparent text-[15px] leading-[1.6] dark:text-[#e5e5e5] light:text-[#262626] placeholder:text-[#505050] outline-none py-2 px-1 min-h-[36px] max-h-[240px]"
              />
              {/* Model menu owns the reasoning-effort picker (per user: effort
                  lives inside the bottom-right model popover, not the input
                  bar). No separate composer pill. */}
              <ModelSelectorCompact />
              <ContextDescriptor
                contextWindow={ctxWin}
                text={input}
                attachmentCount={attachments.length}
                attachments={attachments}
              />
              {/* Φ-docs · per-user long-term memory chip — count + one-click forget */}
              <MemoryBadge />
              {/* Φ-docs · detached deep-research worker panel */}
              <ResearchPanel />
              {isStreaming ? (
                <button
                  type="button"
                  // Φ10/#3 M1: stopGeneration also POSTs /api/chat/stop so the
                  // server aborts + persists the DETACHED generation (a bare
                  // stop() only ends this browser's mirror).
                  onClick={stopGeneration}
                  title="Stop"
                  className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center dark:bg-white/[0.08] light:bg-black/[0.06] hover:dark:bg-white/[0.14] hover:light:bg-black/[0.1] transition-colors max-sm:h-11 max-sm:w-11"
                >
                  <Square className="h-3.5 w-3.5 fill-current text-[#ffb400]" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canSend}
                  title="Send"
                  className={cn(
                    "h-9 w-9 shrink-0 rounded-full flex items-center justify-center transition-all max-sm:h-11 max-sm:w-11",
                    canSend
                      ? "bg-[#ffb400] text-black hover:brightness-110 active:scale-[0.94]"
                      : "dark:bg-white/[0.06] light:bg-black/[0.05] dark:text-[#505050] light:text-[#9a9a9a]",
                  )}
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </form>
        <p className="mt-2 text-center text-[10px] font-mono dark:text-[#3a3a3a] light:text-[#b8b8b8]">
          Leopard can make mistakes. Verify important info.
        </p>
      </div>
    </div>
  );
}
