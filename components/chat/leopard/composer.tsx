"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type FormEvent, type KeyboardEvent } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { ArrowUpIcon, FileIcon, ImageIcon, PlusIcon, SquareIcon } from "lucide-react";
import { useActiveChat } from "@/hooks/use-active-chat";
import { useSettingsStore } from "@/hooks/use-settings-store";
import { ModelSelector } from "./model-selector";
import { ContextBreakdown } from "./context-breakdown";
import { MemoryChips } from "./memory-chips";
import { ResearchPanel } from "../research-panel";
import { McpServerPanel } from "./mcp-server-panel";
import { SkillConfigModal } from "@/components/chat/skill-config-modal";
import { uploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { getModelById } from "@/lib/ai/models";
import { getSkillsSnapshot, subscribeSkills } from "@/lib/skill-store";
import { getSlashMatches, SlashMenu, type SlashMatch } from "../slash-menu";
import { MentionMenu, useRecentChatTitles } from "../mention-menu";
import { MessageAttachmentChip, type PendingAttachment } from "./message-attachment";
import { useMessageQueue } from "./message-queue";
import { useDraftRestore } from "./draft-restore";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { field, ghostButton, inkButton, paper } from "./surfaces";

// Leopard fork of the elements-kit composer: ComposerBar/paper shell, floating
// popovers, icon-swap send, with Leopard wiring (useActiveChat, uploads,
// slash/mention, model/context/memory/research slots, PlusMenu folded in).

export interface ComposerCommand {
  name: string;
  description: string;
}

export interface ComposerPerson {
  name: string;
  role: "agent" | "human";
}

/** People matching a trailing @mention, or none when the caret is not in one. */
export function useMentionMatches(
  value: string,
  people: readonly ComposerPerson[] | undefined,
): ComposerPerson[] {
  return useMemo(() => {
    if (!people) return [];
    const match = /@([\w]*)$/.exec(value);
    if (!match) return [];
    const query = match[1]?.toLowerCase() ?? "";
    return people.filter((person) =>
      person.name.toLowerCase().startsWith(query),
    );
  }, [people, value]);
}

/** Replaces the trailing @mention with the chosen name. */
export function applyMention(value: string, name: string): string {
  return value.replace(/@[\w]*$/, `@${name} `);
}

function ComposerBar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="composer-bar"
      className={cn(
        paper,
        "flex w-full flex-col gap-2 rounded-[24px] p-2 transition-shadow",
        "focus-within:ring-1 focus-within:ring-[#ffb400]/40",
        className,
      )}
      {...props}
    />
  );
}

function ComposerActions({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="composer-actions"
      className={cn("flex items-center gap-1.5", className)}
      {...props}
    />
  );
}

function ComposerSend({
  streaming,
  idle,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  streaming: boolean;
  idle: boolean;
}) {
  return (
    <button
      type={streaming ? "button" : "submit"}
      disabled={!streaming && idle}
      aria-label={streaming ? "Stop generating" : "Send message"}
      data-slot="composer-send"
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full max-sm:size-11",
        streaming || !idle
          ? inkButton
          : "dark:bg-white/[0.06] light:bg-black/[0.05] dark:text-[#505050] light:text-[#9a9a9a] transition-colors",
        className,
      )}
      {...props}
    >
      {streaming ? (
        <SquareIcon className="size-3 fill-current dark:text-[#ffb400] light:text-white" />
      ) : (
        <ArrowUpIcon className="size-4" />
      )}
    </button>
  );
}

/** Attach menu folded in from the former plus-menu: vision-gated media, file,
 *  skill config, mcp config. Hidden inputs reset so a file can be re-picked. */
function ComposerAttachMenu({
  modelVision,
  modelImageEdit,
  onPickMedia,
  onPickFile,
}: {
  modelVision: boolean;
  modelImageEdit: boolean;
  onPickMedia: (files: FileList) => void;
  onPickFile: (files: FileList) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const mediaRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canAttachMedia = modelVision || modelImageEdit;
  const mediaAccept = modelImageEdit && !modelVision ? "image/*" : "image/*,video/*";
  const mediaHint = modelVision ? undefined : modelImageEdit ? "image only" : "needs VLM";

  const item = (
    label: string,
    onClick: () => void,
    disabled = false,
    hint?: string,
  ) => (
    <button
      key={label}
      type="button"
      disabled={disabled}
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left lowercase transition-colors",
        disabled
          ? "cursor-not-allowed dark:text-[#404040] light:text-[#b8b8b8]"
          : "dark:text-[#a3a3a3] light:text-[#525252] hover:dark:bg-white/[0.05] hover:light:bg-black/[0.04] hover:dark:text-white hover:light:text-black",
      )}
    >
      <span>{label}</span>
      {hint && (
        <span className="text-[9px] uppercase tracking-tighter dark:text-[#505050] light:text-[#b8b8b8]">
          {hint}
        </span>
      )}
    </button>
  );

  return (
    <div className="relative shrink-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              title="Add attachment"
              aria-label="Add attachment"
              className={cn(ghostButton, "size-9 max-sm:size-11 dark:border dark:border-white/10 light:border-black/10 dark:bg-white/[0.05] light:bg-black/[0.04] hover:dark:bg-white/[0.1] hover:light:bg-black/[0.08]")}
            >
              <PlusIcon className="size-4" />
            </button>
          }
        />
        <PopoverContent side="top" align="start" sideOffset={8} tint={0.62}>
          <div className="w-[224px] p-1 text-[12px] font-mono">
            {item("attach image / video", () => mediaRef.current?.click(), !canAttachMedia, mediaHint)}
            {item("attach file", () => fileRef.current?.click())}
            {item("add skill", () => setSkillsOpen(true))}
            {item("mcp servers", () => setMcpOpen(true))}
          </div>
        </PopoverContent>
      </Popover>
      <McpServerPanel open={mcpOpen} onClose={() => setMcpOpen(false)} />
      <SkillConfigModal open={skillsOpen} onClose={() => setSkillsOpen(false)} />
      <input
        ref={mediaRef}
        type="file"
        accept={mediaAccept}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onPickMedia(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={fileRef}
        type="file"
        hidden
        onChange={(e) => {
          if (e.target.files) onPickFile(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function Composer() {
  const { sendMessage, status, stopGeneration, currentModelId, chatMeta } = useActiveChat();
  const [input, setInput] = useState("");
  // Kit draft-restore: unsent text survives reloads, keyed per chat.
  const { draft, setDraft } = useDraftRestore(chatMeta?._id ?? "draft");
  useEffect(() => {
    if (draft) setInput((cur) => cur || draft);
  }, [draft]);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Slash/@ popovers: open is derived from input; Esc suppresses until the next keystroke.
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
  useEffect(() => setDismissed(null), [input]);

  // Edit-back-to-composer: message action buttons dispatch composer:set-text.
  useEffect(() => {
    function onSet(e: Event) {
      const text = (e as CustomEvent<{ text: string }>).detail?.text ?? "";
      setInput(text);
      setAttachments([]);
      queueMicrotask(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        try {
          el.setSelectionRange(text.length, text.length);
        } catch {
          /* number inputs have no selection range */
        }
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    window.addEventListener("composer:set-text", onSet);
    return () => window.removeEventListener("composer:set-text", onSet);
  }, []);

  const modelConfig = getModelById(currentModelId);
  const modelVision = modelConfig?.supportsVision ?? false;
  const modelImageEdit = modelConfig?.supportsImageEdit ?? false;
  const ctxWin = modelConfig?.contextWindow;

  const sendWithEnter = useSettingsStore((s) => s.sendWithEnter);
  const isStreaming = status === "submitted" || status === "streaming";
  const hasContent = input.trim().length > 0 || attachments.length > 0;
  const canSend = hasContent && !isStreaming && !uploading;
  const { enqueue, drain } = useMessageQueue();

  // Flush queued text once the active run returns to ready.
  const prevStreaming = useRef(false);
  useEffect(() => {
    if (prevStreaming.current && !isStreaming) {
      const drained = drain();
      for (const m of drained) {
        void sendMessage({ parts: [{ type: "text", text: m.text }] } as never);
      }
    }
    prevStreaming.current = isStreaming;
  }, [isStreaming, drain, sendMessage]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const addFiles = async (files: FileList, kind: "media" | "file") => {
    if (kind === "media" && !modelVision && !modelImageEdit) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        if (kind === "media" && modelImageEdit && !modelVision && !f.type.startsWith("image/")) continue;
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
    const text = input.trim();
    // Mid-run send: hold the text and auto-send when the run finishes.
    if (isStreaming) {
      if (text) {
        enqueue(text);
        setInput("");
        setDraft("");
      }
      return;
    }
    if (!canSend) return;
    const fileParts = attachments.map((a) => ({
      type: "file" as const,
      url: a.url,
      filename: a.name,
      mediaType: a.mediaType,
    }));
    const parts = [...fileParts, ...(text ? [{ type: "text" as const, text }] : [])];
    setInput("");
    setAttachments([]);
    setDraft("");
    void sendMessage({ parts } as never);
  };

  const insertAndRefocus = (next: string) => {
    setInput(next);
    queueMicrotask(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      try {
        el.setSelectionRange(next.length, next.length);
      } catch {
        /* number inputs have no selection range */
      }
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  const selectSlash = (match: SlashMatch) => insertAndRefocus(`/${match.slug} `);
  const selectMention = (title: string) => insertAndRefocus(applyMention(input, title));

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
    const sendKey = sendWithEnter ? !e.shiftKey : e.shiftKey;
    if (e.key === "Enter" && sendKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4 sm:p-6">
      <div className="pointer-events-auto mx-auto max-w-3xl">
        {(attachments.length > 0 || uploading) && (
          <div data-slot="composer-attachments" className="mb-2 flex flex-wrap items-center gap-2">
            {attachments.map((a, i) => (
              <MessageAttachmentChip
                key={`${a.url}-${i}`}
                attachment={a}
                onRemove={() => setAttachments((arr) => arr.filter((_, idx) => idx !== i))}
              />
            ))}
            {uploading && (
              <span className="self-center font-mono text-[10px] dark:text-[#ffb400]/70 light:text-[#d49600]/80">
                uploading…
              </span>
            )}
          </div>
        )}
        <form onSubmit={handleSubmit} className="relative">
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
          <ComposerBar>
            <div className={cn(field, "relative flex items-end gap-1.5 rounded-[18px] px-2 py-2")}>
              <ComposerAttachMenu
                modelVision={modelVision}
                modelImageEdit={modelImageEdit}
                onPickMedia={(f) => addFiles(f, "media")}
                onPickFile={(f) => addFiles(f, "file")}
              />
              <TextareaAutosize
                ref={textareaRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); setDraft(e.target.value); }}
                onKeyDown={handleKeyDown}
                placeholder="Message Leopard…"
                aria-label="Message"
                rows={1}
                minRows={1}
                maxRows={8}
                className="min-h-[36px] max-h-[240px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-[1.6] outline-none dark:text-[#e5e5e5] light:text-[#262626] placeholder:text-[#505050] caret-[#ffb400]"
              />
              <ComposerActions>
                <ModelSelector />
                <ContextBreakdown
                  contextWindow={ctxWin}
                  text={input}
                  attachmentCount={attachments.length}
                  attachments={attachments}
                />
                <MemoryChips />
                <ResearchPanel />
                {isStreaming ? (
                  <ComposerSend
                    streaming
                    idle={false}
                    onClick={stopGeneration}
                    title="Stop"
                  />
                ) : (
                  <ComposerSend streaming={false} idle={!canSend} title="Send" />
                )}
              </ComposerActions>
            </div>
          </ComposerBar>
        </form>
        <p className="mt-2 text-center font-mono text-[10px] dark:text-[#3a3a3a] light:text-[#b8b8b8]">
          Leopard can make mistakes. Verify important info.
        </p>
      </div>
    </div>
  );
}
