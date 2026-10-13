"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { ArrowUpIcon, FileIcon, GlobeIcon, ImageIcon, MicIcon, PlugIcon, PlusIcon, SparklesIcon, SquareIcon } from "lucide-react";
import { useActiveChat } from "@/hooks/use-active-chat";
import { useSettingsStore } from "@/hooks/use-settings-store";
import { ModelSelector } from "./model-selector";
import { ContextBreakdown } from "./context-breakdown";
import { MemoryChips } from "./memory-chips";
import { ResearchPanel } from "../research-panel";
import { McpServerPanel } from "./mcp-server-panel";
import { SkillConfigModal } from "@/components/chat/skill-config-modal";
import { uploadFile } from "@/lib/upload";
import { isCompositionKey } from "@/lib/is-composition-key";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getModelById } from "@/lib/ai/models";
import { useModelHealth } from "@/hooks/use-model-health";
import { getSkillsSnapshot, subscribeSkills } from "@/lib/skill-store";
import { getSlashMatches, SlashMenu, type SlashMatch } from "../slash-menu";
import { MentionMenu, useRecentChatTitles } from "../mention-menu";
import { MessageAttachmentChip, type PendingAttachment } from "./message-attachment";
import { useMessageQueue } from "./message-queue";
import { useDraftRestore } from "./draft-restore";
import { useInputHistory } from "@/hooks/use-input-history";
import { useDictation } from "@/hooks/use-dictation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ghostButton, inkButton, mono, paper } from "./surfaces";

// Leopard fork of the elements-kit composer: ComposerBar/paper shell, floating
// popovers, icon-swap send, with Leopard wiring (useActiveChat, uploads,
// slash/mention, model/context/memory/research slots, PlusMenu folded in).

export interface ComposerCommand {
  name: string;
  description: string;
}

// Whitespace class for the slash trigger scan — module
// scope: a fresh RegExp literal per render would retrigger the deps lint.
const SLASH_WS_RE = /\s/;

export interface ComposerPerson {
  name: string;
  role: "agent" | "human";
}

/** People matching a trailing @mention, or none when the caret is not in one.
 *  The query may contain spaces (chat titles like "Rain essay") — the capture
 *  allows spaces but trims trailing ones; a double space ends the query. */
export function useMentionMatches(
  value: string,
  people: readonly ComposerPerson[] | undefined,
): ComposerPerson[] {
  return useMemo(() => {
    if (!people) return [];
    const match = /@([\w ]*?)$/.exec(value);
    if (!match) return [];
    // Double space (or two-space gap before other text) closes the mention —
    // "@rain  x" typed past the mention no longer edits it.
    if (/  /.test(match[1] ?? "")) return [];
    const query = (match[1] ?? "").trim().toLowerCase();
    return people.filter((person) =>
      person.name.toLowerCase().startsWith(query),
    );
  }, [people, value]);
}

/** Replaces the trailing @mention with the chosen name. */
export function applyMention(value: string, name: string): string {
  return value.replace(/@[\w ]*?$/, `@${name} `);
}

function ComposerBar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="composer-bar"
      className={cn(
        paper,
        "composer-glimmer",
        "flex w-full flex-col gap-1 rounded-[28px] p-1.5 transition-shadow",
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
  modelDown,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  streaming: boolean;
  idle: boolean;
  /** Down-model gate stays clickable (the submit gate toasts the reason) but
   *  reads disabled — aria-disabled + dimmed, not the disabled attribute. */
  modelDown?: boolean;
}) {
  return (
    <button
      type={streaming ? "button" : "submit"}
      disabled={!streaming && idle && !modelDown}
      aria-disabled={!streaming && idle && modelDown ? true : undefined}
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
        <SquareIcon className="size-3 fill-current text-black" />
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
  const webFetchEnabled = useSettingsStore((s) => s.webFetchEnabled);
  const setWebFetchEnabled = useSettingsStore((s) => s.setWebFetchEnabled);

  const canAttachMedia = modelVision || modelImageEdit;
  const mediaAccept = modelImageEdit && !modelVision ? "image/*" : "image/*,video/*";
  const mediaHint = modelVision ? undefined : modelImageEdit ? "image only" : "needs VLM";

  // menu rows: left icon + sentence-case label + right hint chip.
  const item = (
    label: string,
    icon: ReactNode,
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
        "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] transition-colors",
        disabled
          ? "cursor-not-allowed dark:text-[#404040] light:text-[#b8b8b8]"
          : "dark:text-[#c9c9c9] light:text-[#404040] hover:dark:bg-white/[0.06] hover:light:bg-black/[0.04] hover:dark:text-white hover:light:text-black",
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center opacity-70 [&_svg]:size-4">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && (
        <span className={cn(mono, "shrink-0 rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-[9px] uppercase dark:text-[#606060] light:text-[#8a8a8a]")}>
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
              className={cn(ghostButton, "size-9 max-sm:size-11 dark:border dark:border-white/10 light:border-black/10 dark:bg-white/[0.05] light:bg-black/[0.04] hover:dark:bg-white/[0.1] hover:light:bg-black/[0.08] data-[popup-open]:dark:bg-white/[0.1] data-[popup-open]:light:bg-black/[0.08] data-[popup-open]:dark:text-white data-[popup-open]:light:text-black")}
            >
              <PlusIcon className="size-4" />
            </button>
          }
        />
        <PopoverContent side="top" align="start" sideOffset={8} tint={0.62}>
          <div className="w-[232px] p-1">
            {item("Photos & videos", <ImageIcon />, () => mediaRef.current?.click(), !canAttachMedia, mediaHint)}
            {item("Attach file", <FileIcon />, () => fileRef.current?.click())}
            <div className="mx-2 my-1 h-px dark:bg-white/[0.06] light:bg-black/[0.06]" />
            {/* Web fetch master toggle — user-controlled; rides the request
                body as `webFetch` (route hardcodes availability, this opts out). */}
            <button
              type="button"
              role="switch"
              aria-checked={webFetchEnabled}
              onClick={() => setWebFetchEnabled(!webFetchEnabled)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] transition-colors dark:text-[#c9c9c9] light:text-[#404040] hover:dark:bg-white/[0.06] hover:light:bg-black/[0.04] hover:dark:text-white hover:light:text-black"
            >
              <span className="flex size-4 shrink-0 items-center justify-center opacity-70 [&_svg]:size-4"><GlobeIcon /></span>
              <span className="min-w-0 flex-1 truncate">Web fetch</span>
              <span
                className={cn(
                  "relative h-4 w-7 shrink-0 rounded-full transition-colors",
                  webFetchEnabled ? "bg-[#ffb400]" : "dark:bg-white/[0.12] light:bg-black/[0.12]",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-3 rounded-full bg-white transition-all",
                    webFetchEnabled ? "left-3.5" : "left-0.5",
                  )}
                />
              </span>
            </button>
            <div className="mx-2 my-1 h-px dark:bg-white/[0.06] light:bg-black/[0.06]" />
            {item("Skills", <SparklesIcon />, () => setSkillsOpen(true))}
            {item("MCP servers", <PlugIcon />, () => setMcpOpen(true))}
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

// Pending composer text survives a composer swap: editing the ONLY message in
// a chat truncates the thread to empty, which unmounts the bottom composer and
// mounts the center one — the composer:set-text event fired before the new
// instance subscribed. Park the text here; any mounted/mounting composer
// consumes it.
let pendingComposerText: { text: string; at: number } | null = null;
const takePendingComposerText = (): string | null => {
  const p = pendingComposerText;
  pendingComposerText = null;
  // 5s TTL — a park older than that belongs to an abandoned edit, not a
  // composer swap in flight.
  return p && Date.now() - p.at < 5000 ? p.text : null;
};

export function Composer({ placement = "bottom" }: { placement?: "bottom" | "center" } = {}) {
  const { sendMessage, status, stopGeneration, currentModelId, chatMeta, serverStreaming, retrying, messages } = useActiveChat();
  // Composer input history: ArrowUp recalls
  // the previous sent message, ArrowDown walks back to the live draft.
  const { tryRecall } = useInputHistory(messages);
  const [input, setInput] = useState("");
  // Dictation (speech input): the mic streams partial + final transcripts into
  // the composer — partial previews the in-progress tail, final commits it.
  // The base is the text present when dictation STARTS, so typed + dictated
  // content coexist. Unsupported browsers hide the button.
  const dictationBaseRef = useRef("");
  const inputAtStartRef = useRef("");
  const dictation = useDictation({
    onResult: (transcript, isFinal) => {
      if (isFinal) {
        dictationBaseRef.current = `${dictationBaseRef.current}${transcript} `;
        setInput(`${inputAtStartRef.current}${dictationBaseRef.current}`.trimEnd());
      } else {
        setInput(`${inputAtStartRef.current}${dictationBaseRef.current}${transcript}`.trimEnd());
      }
    },
  });
  const toggleDictation = () => {
    if (!dictation.listening) {
      // Snapshot the typed text so speech appends, not overwrites.
      inputAtStartRef.current = input ? `${input.trimEnd()} ` : "";
      dictationBaseRef.current = "";
    }
    dictation.toggle();
  };
  // Consume parked edit-text on mount (strict-mode safe: effects, not the
  // useState initializer, which double-invokes and would eat the value).
  const inputRef = useRef(input);
  inputRef.current = input;
  // A send clears input + draft; without this flag the unmount cleanup re-parks
  // the pre-send text and the next composer (target chat after the draft
  // handoff) re-injects it — the message text reappeared in the composer after
  // it was already sent (2026-10-06).
  const justSentRef = useRef(false);
  useEffect(() => {
    const t = takePendingComposerText();
    if (t !== null) setInput(t);
    // Unmounting with unsent text re-parks it: an edit that empties the
    // thread swaps bottom→center composer (and back, when the mirror heals
    // the row) — the text must survive BOTH transitions.
    return () => {
      if (!justSentRef.current && inputRef.current.trim()) {
        pendingComposerText = { text: inputRef.current, at: Date.now() };
      }
    };
  }, []);
  // Kit draft-restore: unsent text survives reloads, keyed per chat.
  const { draft, setDraft } = useDraftRestore(chatMeta?._id ?? "draft");
  useEffect(() => {
    if (draft) setInput((cur) => cur || draft);
  }, [draft]);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  // Filenames whose upload failed — rendered as dismissible error chips
  // alongside the live ones (cleared on the next successful add).
  const [failedUploads, setFailedUploads] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Slash/@ popovers: open is derived from input; Esc suppresses until the next keystroke.
  const skills = useSyncExternalStore(subscribeSkills, getSkillsSnapshot);
  const chatTitles = useRecentChatTitles();
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState<"slash" | "mention" | null>(null);

  // Slash/@ trigger detection: the slash
  // menu used to open ONLY with `/` at position 0 — typing "explain /brain"
  // mid-message never opened it. The rule: scan back from the caret to the
  // nearest whitespace; a `/` starting a whitespace-delimited token is a
  // trigger wherever it sits. `\w`-only after the trigger keeps URLs
  // (example.com/a) non-triggers.
  const slashValue = useMemo(() => {
    const up = input; // textarea has no caret tracking; treat end-of-input as the caret
    for (let i = up.length - 1; i >= 0; i--) {
      const ch = up[i];
      if (SLASH_WS_RE.test(ch)) return "";
      if (up.startsWith("/", i)) {
        if (i > 0 && !SLASH_WS_RE.test(up[i - 1])) continue;
        return /^\/\w*$/.test(up.slice(i)) ? up.slice(i) : "";
      }
    }
    return "";
  }, [input]);
  const slashMatches = useMemo(
    () => getSlashMatches(slashValue, skills),
    [slashValue, skills],
  );
  // Keep the menu open while a slash query is typed, even on zero matches —
  // vanishing on no-match read as a broken palette (audit 2026-10-09: "/diag"
  // closed the menu entirely). Empty state renders inside the menu.
  const slashOpen = dismissed !== "slash" && slashValue.length > 0;

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
      pendingComposerText = { text, at: Date.now() };
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
  // serverStreaming: reopened mid-generation — the detached route task owns
  // the run; stop still works (server abort registry is keyed by assistant id).
  // retrying: the auto-retry pause after an errored run — show the stop state
  // (QA M5: the button used to sit inert/disabled through the whole retry).
  const isStreaming =
    status === "submitted" || status === "streaming" || serverStreaming || retrying;
  const hasContent = input.trim().length > 0 || attachments.length > 0;
  // Block send when the SELECTED model is probed-down — sending into a dead
  // model produced the "bubble appears, then nothing" black hole (the picker
  // badge alone lives inside a closed popover). The store polls /api/models/health.
  const modelDown = useModelHealth((s) => {
    const h = s.byId[currentModelId];
    return s.loaded && h !== undefined && !h.ok;
  });
  const canSend = hasContent && !isStreaming && !uploading;
  const { queued, enqueue, drain, remove: removeQueued } = useMessageQueue();

  // Steer: stop the current run, pull the
  // chosen item out of the queue, send it immediately. The stopped turn keeps
  // whatever it streamed (server-side abort semantics); the remaining queue
  // still auto-flushes when the stopped run settles to ready.
  const steerQueued = (id: string) => {
    const item = queued.find((m) => m.id === id);
    if (!item) return;
    removeQueued(id);
    stopGeneration();
    void sendMessage({ parts: [{ type: "text", text: item.text }] } as never);
  };

  // Flush queued text once the active run returns to ready. Gate on a CLEAN
  // completion — status==='error' is not in isStreaming, so a partial stream
  // that errors would otherwise fire queued messages into a failed turn the
  // user never confirmed (audit 2026-10-06).
  const prevStreaming = useRef(false);
  useEffect(() => {
    if (prevStreaming.current && !isStreaming && status === "ready") {
      const drained = drain();
      for (const m of drained) {
        void sendMessage({ parts: [{ type: "text", text: m.text }] } as never);
      }
    }
    prevStreaming.current = isStreaming;
  }, [isStreaming, status, drain, sendMessage]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const addFiles = async (files: FileList, kind: "media" | "file") => {
    if (kind === "media" && !modelVision && !modelImageEdit) {
      // Paste/drop of an image on a text-only model used to vanish silently —
      // say why (operator 2026-10-09).
      toast.error(`${getModelById(currentModelId)?.name ?? "This model"} can't read images — pick a vision model to attach one.`);
      return;
    }
    setUploading(true);
    try {
      // QA m4: skip exact duplicates — against queued attachments AND within
      // this batch (the state check alone races: same-batch appends aren't
      // visible until the next render).
      const seen = new Set(attachments.map((a) => a.name));
      for (const f of Array.from(files)) {
        if (kind === "media" && modelImageEdit && !modelVision && !f.type.startsWith("image/")) continue;
        if (seen.has(f.name)) continue;
        seen.add(f.name);
        const up = await uploadFile(f);
        setAttachments((a) => [...a, { url: up.url, name: up.name, mediaType: up.mediaType }]);
        setFailedUploads((prev) => prev.filter((n) => n !== f.name));
      }
    } catch (e) {
      console.error("upload failed", e);
      toast.error("Attachment upload failed — the file wasn't added. Try again.");
      // In-place error state (audit 2026-10-10): a toast alone auto-dismisses
      // — the user who missed it had no trace of what happened. A failed chip
      // stays in the row until retried or dismissed.
      const failedNames = Array.from(files).map((f) => f.name);
      setFailedUploads((prev) => [
        ...prev.filter((n) => !failedNames.includes(n)),
        ...failedNames,
      ]);
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
    // Dead model → don't fire into the void. Tell the user + point at the picker.
    if (modelDown) {
      toast.error(`${getModelById(currentModelId)?.name ?? "This model"} is unreachable right now — pick another model.`);
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
    justSentRef.current = true;
    setInput("");
    setAttachments([]);
    setDraft("");
    void sendMessage({ parts } as never);
  };

  // Drag-and-drop attach:
  // an unprevented file drop navigates the tab to the file, so file drags are
  // claimed via preventDefault on dragenter/dragover even when they'll be
  // rejected; the overlay + dropEffect only light up when the model can read
  // the payload (vision for media, always for plain files).
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);
  const onDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    if (dragDepth.current === 0) setDragActive(false);
  };
  const onDropFiles = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    if (!e.dataTransfer.types.includes("Files")) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const allImages = files.every((f) => f.type.startsWith("image/"));
    void addFiles(e.dataTransfer.files, allImages ? "media" : "file");
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
    // Escape dismisses even an EMPTY menu (the no-match empty state can stay
    // open now — audit 2026-10-09); nav/select still need count > 0.
    if (menuOpen && e.key === "Escape") {
      e.preventDefault();
      setDismissed(slashOpen ? "slash" : "mention");
      // A bare trigger fragment ("/" or "/bra" with nothing after it as real
      // content) is menu scaffolding, not a draft — leaving it meant the next
      // session's draft-restore prefixed the user's message with a stray "/"
      // (2026-10-12 live: "/In one short paragraph…" sent).
      if (slashOpen && /^\/\w*$/.test(input)) setInput("");
      return;
    }
    // Escape with NO menu open → blur the composer (VS Code / Linear idiom —
    // audit 2026-10-10: Escape-after-send had no defined behavior).
    if (e.key === "Escape") {
      e.preventDefault();
      textareaRef.current?.blur();
      return;
    }
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
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey && !isCompositionKey(e))) {
        e.preventDefault();
        if (slashOpen) selectSlash(slashMatches[activeIndex % count]);
        else selectMention(mentionMatches[activeIndex % count].name);
        return;
      }
    }
    // Input history (no menu open): ArrowUp recalls the previous sent message
    // from the first caret line; ArrowDown walks back toward the live draft
    // from the last line. Caret-mid-textarea motion is untouched.
    if (!menuOpen && (e.key === "ArrowUp" || e.key === "ArrowDown") && !isCompositionKey(e)) {
      const el = e.currentTarget;
      const beforeCaret = el.value.slice(0, el.selectionStart);
      const afterCaret = el.value.slice(el.selectionEnd);
      const atFirstLine = !beforeCaret.includes("\n");
      const atLastLine = !afterCaret.includes("\n");
      const recalled = tryRecall(e.key, el.value, atFirstLine, atLastLine);
      if (recalled !== undefined) {
        e.preventDefault();
        setInput(recalled);
        // Move the caret to the end of the recalled text.
        queueMicrotask(() => {
          textareaRef.current?.setSelectionRange(recalled.length, recalled.length);
        });
      }
    }
    const sendKey = sendWithEnter ? !e.shiftKey : e.shiftKey;
    if (e.key === "Enter" && sendKey && !isCompositionKey(e)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={placement === "center" ? "pointer-events-none w-full px-4 sm:px-6" : "pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4 sm:p-6"}>
      <div className="pointer-events-auto mx-auto max-w-3xl">
        {/* QA loop-2: queued sends used to vanish silently — show them. */}
        {queued.length > 0 && (
          <div data-slot="composer-queue" className="mb-3 flex flex-wrap items-center gap-2">
            {queued.map((q) => (
              <span
                key={q.id}
                className="flex items-center gap-1.5 rounded-lg border py-1 px-2 dark:border-white/[0.08] light:border-black/[0.08] dark:bg-white/[0.04] light:bg-black/[0.03]"
              >
                <span className="max-w-40 truncate text-[11px] dark:text-[#a3a3a3] light:text-[#525252]">
                  {q.text}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-tight dark:text-[#ffb400]/70 light:text-[#d49600]/80">
                  queued
                </span>
                {/* Steer: stop the current run and
                    send this item now. */}
                <button
                  type="button"
                  aria-label={`Stop the current reply and send "${q.text}" now`}
                  title="Run now"
                  className="rounded p-0.5 text-[11px] leading-none dark:text-[#ffb400]/80 light:text-[#d49600]/90 hover:dark:text-[#ffb400] hover:light:text-[#d49600]"
                  onClick={() => steerQueued(q.id)}
                >
                  ↗
                </button>
                <button
                  type="button"
                  aria-label="Remove from queue"
                  className="ml-0.5 rounded p-0.5 text-[11px] leading-none dark:text-[#a3a3a3]/60 dark:hover:text-[#e5e5e5] light:text-[#525252]/60 light:hover:text-[#262626]"
                  onClick={() => removeQueued(q.id)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {(attachments.length > 0 || uploading || failedUploads.length > 0) && (
          <div data-slot="composer-attachments" className="mb-3 flex flex-wrap items-center gap-2">
            {attachments.map((a, i) => (
              <MessageAttachmentChip
                key={`${a.url}-${i}`}
                attachment={a}
                onRemove={() => setAttachments((arr) => arr.filter((_, idx) => idx !== i))}
              />
            ))}
            {failedUploads.map((name) => (
              <span
                key={`failed-${name}`}
                className="flex items-center gap-1.5 rounded-lg border py-1 px-2 dark:border-red-500/40 light:border-red-500/40 dark:bg-red-500/[0.06] light:bg-red-500/[0.05]"
              >
                <span className="max-w-32 truncate text-[11px] dark:text-red-300/90 light:text-red-700">
                  {name}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-tight dark:text-red-400/80 light:text-red-600/90">
                  failed
                </span>
                <button
                  type="button"
                  aria-label={`Dismiss failed upload ${name}`}
                  className="ml-0.5 rounded p-0.5 text-[11px] leading-none dark:text-red-300/60 dark:hover:text-red-200 light:text-red-700/60 light:hover:text-red-800"
                  onClick={() =>
                    setFailedUploads((prev) => prev.filter((n) => n !== name))
                  }
                >
                  ×
                </button>
              </span>
            ))}
            {uploading && (
              <span className="flex items-center gap-1.5 self-center font-mono text-[10px] dark:text-[#ffb400]/80 light:text-[#d49600]">
                <span className="size-2 animate-spin rounded-full border border-current border-t-transparent" aria-hidden />
                uploading…
              </span>
            )}
          </div>
        )}
        <form
          onSubmit={handleSubmit}
          className="relative"
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDropFiles}
        >
          {dragActive && (
            <div
              data-slot="composer-dropzone"
              aria-hidden
              className="absolute inset-0 z-20 flex items-center justify-center rounded-[26px] border-2 border-dashed dark:border-[#ffb400]/50 light:border-[#d49600]/60 dark:bg-[#ffb400]/[0.04] light:bg-[#d49600]/[0.04] pointer-events-none"
            >
              <span className="font-mono text-[12px] dark:text-[#ffb400] light:text-[#d49600]">
                drop files to attach
              </span>
            </div>
          )}
          {slashOpen && (
            <SlashMenu
              matches={slashMatches}
              activeIndex={activeIndex % slashMatches.length}
              onSelect={selectSlash}
              query={slashValue.slice(1)}
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
            {/* ChatGPT-style: text row on top, control row below. */}
            <TextareaAutosize
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); setDraft(e.target.value); }}
              onKeyDown={handleKeyDown}
              // Ctrl/Cmd+V image paste (operator 2026-10-09): image payloads on
              // the clipboard become attachments (vision-gated via addFiles),
              // same as ChatGPT paste-to-attach.
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                const files = Array.from(items)
                  .filter((it) => it.kind === "file")
                  .map((it) => it.getAsFile())
                  .filter((f): f is File => !!f);
                if (files.length === 0) return; // text paste — default behavior
                e.preventDefault();
                const dt = new DataTransfer();
                for (const f of files) dt.items.add(f);
                void addFiles(dt.files, "media");
              }}
              placeholder="Ask anything"
              aria-label="Message"
              aria-describedby="composer-disclaimer"
              rows={1}
              minRows={1}
              maxRows={8}
              className="min-h-[44px] max-h-[240px] w-full resize-none bg-transparent px-3 pt-3 pb-1 text-[15px] leading-[1.6] outline-none dark:text-[#e5e5e5] light:text-[#262626] placeholder:text-[#505050] light:placeholder:text-[#8a8a8a] caret-[#ffb400] light:caret-[#8a5c00]"
            />
            <div className="flex items-center justify-between gap-1.5 px-1.5 pb-1.5 min-w-0">
              <ComposerAttachMenu
                modelVision={modelVision}
                modelImageEdit={modelImageEdit}
                onPickMedia={(f) => addFiles(f, "media")}
                onPickFile={(f) => addFiles(f, "file")}
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
                {/* Dictation: speech input streams into the composer. Hidden
                    where the SpeechRecognition API is unsupported. Disabled
                    (not unmounted) mid-stream — hiding it shifted the action
                    row every run (2026-10-12 audit). */}
                {dictation.supported && (
                  <button
                    type="button"
                    disabled={isStreaming}
                    title={dictation.listening ? "Stop dictation" : isStreaming ? "Dictation unavailable while generating" : "Dictate"}
                    aria-label={dictation.listening ? "Stop dictation" : "Dictate"}
                    aria-pressed={dictation.listening}
                    onClick={toggleDictation}
                    className={cn(
                      ghostButton,
                      "grid size-9 shrink-0 place-items-center rounded-full max-sm:size-11 disabled:opacity-35 disabled:pointer-events-none",
                      dictation.listening &&
                        "dark:text-[#ffb400] light:text-[#d49600] dark:bg-[#ffb400]/[0.12] light:bg-[#d49600]/[0.14]",
                    )}
                  >
                    <MicIcon
                      className={cn(
                        "size-4",
                        dictation.listening && "animate-pulse motion-reduce:animate-none",
                      )}
                    />
                  </button>
                )}
                {isStreaming ? (
                  <ComposerSend
                    streaming
                    idle={false}
                    onClick={stopGeneration}
                    title="Stop"
                  />
                ) : (
                  // modelDown keeps the button CLICKABLE (the handleSubmit gate
                  // fires the explaining toast) but dims it + title says why —
                  // audit 2026-10-08: a fully enabled-looking send into a dead
                  // model read as a bug before the toast landed.
                  <ComposerSend
                    streaming={false}
                    idle={!canSend || modelDown}
                    modelDown={modelDown}
                    title={modelDown ? "Model is currently down — pick another" : "Send"}
                  />
                )}
              </ComposerActions>
            </div>
          </ComposerBar>
        </form>
        <p id="composer-disclaimer" className="mt-2 text-center font-mono text-[10px] dark:text-[#3a3a3a] light:text-[#737373]">
          Leopard can make mistakes. Verify important info.
        </p>
      </div>
    </div>
  );
}
