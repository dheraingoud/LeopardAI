"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import TextareaAutosize from "react-textarea-autosize";
import { motion } from "framer-motion";
import { FileText, Minimize2, Plus, Send, Square, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { chunkFile, extractOutline } from "@/lib/file-chunker";
import { MODELS, type Model } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SendOptions {
  inlineImages?: string[];
  imageAspectRatio?: "1:1" | "16:9" | "9:16" | "3:2" | "2:3" | "5:4" | "4:5";
}

interface ContextUsagePayload {
  percentUsed: number;
  usedTokens: number;
  maxTokens: number;
}

interface InputBarProps {
  onSend: (message: string, model: string, options?: SendOptions) => void | Promise<void>;
  onStop?: () => void;
  onCompact?: () => void | Promise<void>;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  chatModel?: string;
  contextUsage?: ContextUsagePayload;
  textOnlyModels?: boolean;
}

interface AttachedFile {
  name: string;
  type: string;
  size: number;
  preview?: string;
  textContent?: string;
  compressed?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;
const MAX_MESSAGE_LENGTH = 110_000;
const LONG_FILE_LINE_THRESHOLD = 1500;
const LONG_FILE_CHAR_THRESHOLD = 60_000;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isTextLike(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  return /\.(json|md|csv|yaml|yml|xml|ts|tsx|js|jsx|py|java|c|cpp|rs|go|sql|sh|bash|html|css|scss)$/i.test(
    file.name,
  );
}

function compressLongFileForContext(filename: string, content: string): { textContent: string; compressed: boolean } {
  const lineCount = content.split("\n").length;
  if (lineCount <= LONG_FILE_LINE_THRESHOLD && content.length <= LONG_FILE_CHAR_THRESHOLD) {
    return { textContent: content, compressed: false };
  }

  const chunked = chunkFile(content, filename, 1700);
  const outlineRaw = extractOutline(content, chunked.language).trim();
  const outline = outlineRaw
    ? outlineRaw.split("\n").slice(0, 40).join("\n")
    : "(No structural outline detected)";

  const previewChunks = chunked.chunks.slice(0, 2);
  const tailChunk = chunked.chunks.length > 2 ? chunked.chunks[chunked.chunks.length - 1] : null;

  const chunkText = [
    ...previewChunks.map(
      (chunk) =>
        `Chunk ${chunk.index + 1}/${chunked.chunks.length} (lines ${chunk.startLine}-${chunk.endLine}):\n` +
        chunk.content.slice(0, 4500),
    ),
    ...(tailChunk
      ? [
          `Chunk ${tailChunk.index + 1}/${chunked.chunks.length} (lines ${tailChunk.startLine}-${tailChunk.endLine}):\n` +
            tailChunk.content.slice(0, 2800),
        ]
      : []),
  ].join("\n\n---\n\n");

  const packed = [
    "[LONG FILE COMPRESSED FOR CONTEXT]",
    `File: ${filename}`,
    `Language: ${chunked.language}`,
    `Total lines: ${chunked.totalLines}`,
    `Total chunks: ${chunked.chunks.length}`,
    "",
    "Outline:",
    outline,
    "",
    "Representative chunks:",
    chunkText,
    "",
    "Note: Ask for a specific function/class/line range to fetch more focused chunks.",
  ]
    .join("\n")
    .slice(0, 70_000);

  return { textContent: packed, compressed: true };
}

function formatContextWindow(value: number): string {
  if (!value || value <= 1) return "media";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return `${value}`;
}

function normalizeMultiplier(model: Model): "1x" | "1.5x" | "3x" {
  if (model.id === "glm-5.1" || model.id === "kimi-k2.5") return "3x";
  if (model.id === "minimax-m2.5" || model.id === "minimax-m2.7" || model.id === "gemma-4-31b") {
    return "1.5x";
  }
  return "1x";
}

function extractImageUrl(markdownImage: string): string | null {
  const match = markdownImage.match(/!\[[^\]]*\]\(([^)]+)\)/i);
  return match?.[1] || null;
}

export default function InputBar({
  onSend,
  onStop,
  onCompact,
  isStreaming = false,
  disabled = false,
  placeholder = "Message Leopard",
  chatModel,
  contextUsage,
  textOnlyModels = false,
}: InputBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [message, setMessage] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model>(() => {
    if (chatModel) {
      const found = MODELS.find((m) => m.id === chatModel);
      if (found && found.available) return found;
    }
    return MODELS.find((m) => m.available && m.modality === "text") || MODELS[0];
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dynamicIslandMaxWidth = useMemo(() => {
    const length = message.trim().length;
    if (attachedFiles.length > 0 || length > 320) return 980;
    if (length > 180) return 940;
    if (length > 80) return 900;
    return 840;
  }, [attachedFiles.length, message]);

  const glowBoost = useMemo(() => {
    if (message.trim().length === 0 && attachedFiles.length === 0) return 0.06;
    if (message.trim().length > 180 || attachedFiles.length > 0) return 0.12;
    return 0.09;
  }, [attachedFiles.length, message]);

  const groups = useMemo(() => {
    const byAvailabilityThenName = (a: Model, b: Model) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return a.name.localeCompare(b.name);
    };

    if (textOnlyModels) {
      return [
        {
          label: "LLM",
          items: MODELS.filter((m) => m.modality === "text").sort(byAvailabilityThenName),
        },
      ];
    }

    return [
      {
        label: "LLM",
        items: MODELS.filter((m) => m.modality === "text").sort(byAvailabilityThenName),
      },
      {
        label: "VLM",
        items: MODELS.filter((m) => m.modality === "vision").sort(byAvailabilityThenName),
      },
      {
        label: "Image",
        items: MODELS.filter((m) => m.modality === "image").sort(byAvailabilityThenName),
      },
      {
        label: "Video",
        items: MODELS.filter((m) => m.modality === "video-physics").sort(byAvailabilityThenName),
      },
    ];
  }, [textOnlyModels]);

  useEffect(() => {
    const handleSlashFocus = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        event.preventDefault();
        textareaRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleSlashFocus);
    return () => window.removeEventListener("keydown", handleSlashFocus);
  }, []);

  const processFile = async (file: File): Promise<AttachedFile | null> => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`${file.name} is too large (max 10MB)`);
      return null;
    }

    const attached: AttachedFile = {
      name: file.name,
      type: file.type,
      size: file.size,
    };

    if (file.type.startsWith("image/")) {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      attached.preview = dataUrl;
      attached.textContent = `![${file.name}](${dataUrl})`;
      return attached;
    }

    if (isTextLike(file)) {
      const rawText = await file.text();
      const packed = compressLongFileForContext(file.name, rawText);
      attached.textContent = packed.textContent;
      attached.compressed = packed.compressed;
      if (packed.compressed) {
        toast.message(`${file.name} was compressed for long-context handling.`);
      }
      return attached;
    }

    attached.textContent = `[File: ${file.name} (${formatFileSize(file.size)})]`;
    return attached;
  };

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).slice(0, MAX_ATTACHMENTS);
    const processed = await Promise.all(fileArray.map((file) => processFile(file)));
    const valid = processed.filter(Boolean) as AttachedFile[];

    if (valid.length === 0) return;

    setAttachedFiles((prev) => {
      const next = [...prev, ...valid].slice(0, MAX_ATTACHMENTS);
      return next;
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const detectCodePaste = useCallback((text: string): AttachedFile | null => {
    if (text.length < 100) return null;

    const codePatterns = [
      /\b(function|const|let|var|import|export|class|def|func|fn)\b/,
      /\{[\s\S]*\}/,
      /\[[\s\S]*\]/,
      /(return|if|else|for|while)\s*\(/,
      /=>\s*\{/,
      /^\s*(public|private|async)\s+/m,
    ];

    const looksLikeCode = codePatterns.some((pattern) => pattern.test(text));
    if (!looksLikeCode) return null;

    let ext = "js";
    if (/import\s+React|JSX|<\w+[^>]*>/.test(text)) ext = "tsx";
    else if (/\bdef\s+\w+\s*\(|import\s+\w+\s+from/.test(text)) ext = "py";
    else if (/\bfunc\s+\w+|package\s+\w+/.test(text)) ext = "go";
    else if (/interface\s+\w+|type\s+\w+\s*=/.test(text)) ext = "ts";

    return {
      name: `pasted-code.${ext}`,
      type: "text/plain",
      size: text.length,
      textContent: text,
    };
  }, []);

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent) => {
      const items = event.clipboardData.items;
      const files: File[] = [];

      for (let i = 0; i < items.length; i += 1) {
        if (items[i].kind === "file") {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        event.preventDefault();
        await handleFiles(files);
        return;
      }

      const text = event.clipboardData.getData("text");
      if (!text) return;

      const codeAttachment = detectCodePaste(text);
      if (!codeAttachment) return;

      event.preventDefault();
      setAttachedFiles((prev) => [...prev, codeAttachment].slice(0, MAX_ATTACHMENTS));
      toast.success("Code snippet added as attachment");
    },
    [detectCodePaste, handleFiles],
  );

  const handleModelSelect = useCallback(
    (model: Model) => {
      if (!model.available) {
        toast.error(`${model.name} is currently unavailable`);
        return;
      }

      if (textOnlyModels && model.modality !== "text") {
        toast.error("Only text models are available in this workspace.");
        return;
      }

      setSelectedModel(model);
      setSelectorOpen(false);

      if (model.modality && model.modality !== "text") {
        const match = pathname.match(/^\/app\/chat\/([^/?#]+)/);
        const fromChatId = match?.[1];
        const target = fromChatId
          ? `/app/playground/${encodeURIComponent(model.id)}?fromChat=${encodeURIComponent(fromChatId)}`
          : `/app/playground/${encodeURIComponent(model.id)}`;
        router.push(target);
      }
    },
    [pathname, router, textOnlyModels],
  );

  const handleCompactFromContext = useCallback(() => {
    setContextPanelOpen(false);
    if (onCompact) {
      void onCompact();
    }
  }, [onCompact]);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    const hasContent = trimmed.length > 0 || attachedFiles.length > 0;

    if (!hasContent || disabled || isStreaming) return;

    if (!selectedModel.available) {
      toast.error(`${selectedModel.name} is currently unavailable`);
      return;
    }

    const inlineImages: string[] = [];
    const textParts: string[] = [];

    if (trimmed) {
      textParts.push(trimmed);
    }

    if (attachedFiles.length > 0) {
      const fileContents = attachedFiles
        .map((f) => {
          if (f.preview && f.textContent) {
            const imageUrl = extractImageUrl(f.textContent);
            if (imageUrl) {
              inlineImages.push(imageUrl);
              return "";
            }
          }

          if (f.textContent && f.textContent.startsWith("[")) return f.textContent;

          if (f.textContent) {
            const ext = f.name.split(".").pop() || "text";
            const hint = f.compressed ? " (compressed context view)" : "";
            return `\`\`\`${ext}\n// ${f.name}${hint}\n${f.textContent}\n\`\`\``;
          }

          return `[File: ${f.name}]`;
        })
        .filter(Boolean)
        .join("\n\n");

      if (fileContents) {
        textParts.push(fileContents);
      }
    }

    let fullMessage = textParts.join("\n\n").trim();

    if (fullMessage.length > MAX_MESSAGE_LENGTH) {
      fullMessage = `${fullMessage.slice(0, MAX_MESSAGE_LENGTH)}\n\n[Truncated to fit model context budget.]`;
      toast.warning("Message was truncated to fit context limits.");
    }

    void onSend(
      fullMessage,
      selectedModel.id,
      inlineImages.length > 0 ? { inlineImages } : undefined,
    );

    setMessage("");
    setAttachedFiles([]);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [
    attachedFiles,
    disabled,
    isStreaming,
    message,
    onSend,
    selectedModel,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" && !e.shiftKey) || ((e.ctrlKey || e.metaKey) && e.key === "Enter")) {
      e.preventDefault();
      handleSend();
    }

    if (e.key === "Escape" && message.length > 0) {
      e.preventDefault();
      setMessage("");
    }
  };

  const canSend =
    !disabled &&
    !isStreaming &&
    selectedModel.available &&
    (message.trim().length > 0 || attachedFiles.length > 0);

  const showContext = Boolean(contextUsage);

  const contextPercent = Math.min(100, Math.max(0, contextUsage?.percentUsed || 0));

  const contextRingColor = contextPercent >= 90 ? "#ff6666" : contextPercent >= 72 ? "#ffd47d" : "#f6f6f6";
  const ringRadius = 8.5;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - contextPercent / 100);

  const systemInstructionsPct = Number((contextPercent * 0.041).toFixed(1));
  const toolDefinitionsPct = Number((contextPercent * 0.1).toFixed(1));
  const messagesPct = Number((contextPercent * 0.249).toFixed(1));
  const toolResultsPct = Number(
    Math.max(0, contextPercent - systemInstructionsPct - toolDefinitionsPct - messagesPct).toFixed(1),
  );

  const systemTokens = Math.round((systemInstructionsPct / 100) * (contextUsage?.maxTokens || 0));
  const toolsTokens = Math.round((toolDefinitionsPct / 100) * (contextUsage?.maxTokens || 0));
  const messagesTokens = Math.round((messagesPct / 100) * (contextUsage?.maxTokens || 0));
  const toolResultsTokens = Math.round((toolResultsPct / 100) * (contextUsage?.maxTokens || 0));

  const reservedPct = Math.max(0, Math.min(100, Number((100 - contextPercent).toFixed(1))));
  const contextLabel = contextUsage
    ? `${(contextUsage.usedTokens / 1000).toFixed(1)}K/${(contextUsage.maxTokens / 1000).toFixed(0)}K`
    : "";

  return (
    <div className="mx-auto w-full px-2 sm:px-4">
      <motion.div
        className="mx-auto w-full"
        animate={{ maxWidth: dynamicIslandMaxWidth }}
        transition={{ duration: 0.22, ease: [0.2, 0.9, 0.3, 1] }}
      >
        <div className="relative overflow-hidden rounded-[28px] border border-[#ffb40024] bg-[linear-gradient(160deg,rgba(16,13,9,0.97)_0%,rgba(9,8,7,0.988)_54%,rgba(5,5,5,0.997)_100%)] shadow-[0_14px_32px_rgba(0,0,0,0.46),0_0_14px_rgba(255,180,0,0.06)] backdrop-blur-2xl">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 18% 0%, rgba(255,217,138,0.08), transparent 38%), radial-gradient(circle at 84% 100%, rgba(255,170,34,0.05), transparent 52%)",
              opacity: 0.46 + glowBoost,
            }}
          />

          {attachedFiles.length > 0 && (
            <div className="relative flex gap-2 overflow-x-auto border-b border-[#ffb4002a] px-3 py-2">
              {attachedFiles.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="relative flex min-w-[145px] items-center gap-2 rounded-lg border border-[#ffb4002f] bg-black/35 px-2.5 py-1.5"
                >
                  {file.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.preview} alt={file.name} className="h-7 w-7 rounded-md object-cover" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-[#efc676]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] text-[#f8ebcf]">{file.name}</p>
                    <p className="text-[10px] text-[#ba9a59]">
                      {formatFileSize(file.size)}{file.compressed ? " • compact" : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => removeFile(index)}
                    className="text-[#d8b772] transition hover:text-[#fff1cf]"
                    title="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="relative flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#ffb40055] bg-[#2a1d06] text-[#f2cb79] transition hover:bg-[#3a290b] hover:text-[#ffe4a8]"
              title="Add files"
            >
              <Plus className="h-4 w-4" />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.txt,.md,.json,.csv,.tsv,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.rs,.go,.sql,.yaml,.yml,.xml,.sh,.doc,.docx,.xls,.xlsx,.pdf,.rtf"
              className="hidden"
              onChange={(event) => {
                if (event.target.files) {
                  void handleFiles(event.target.files);
                }
                event.target.value = "";
              }}
            />

            <div className="min-w-0 flex-1">
              <TextareaAutosize
                ref={textareaRef}
                minRows={1}
                maxRows={8}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={(event) => {
                  void handlePaste(event);
                }}
                placeholder={placeholder}
                disabled={disabled || isStreaming}
                className="w-full resize-none bg-transparent py-1.5 text-sm leading-6 text-[#f6ecd8] placeholder:text-[#caa45e] outline-none sm:text-[15px]"
              />
            </div>

            <div className="flex shrink-0 items-center gap-2 border-l border-[#ffb40022] pl-2.5 sm:pl-3">
              <DropdownMenu
                open={selectorOpen}
                onOpenChange={(open) => {
                  setSelectorOpen(open);
                }}
              >
                <DropdownMenuTrigger className="inline-flex max-w-[180px] items-center gap-1.5 rounded-md px-1 py-0.5 text-[12px] font-medium text-[#f2f2f2] transition hover:bg-white/[0.04] hover:text-white focus:outline-none">
                  <span className="truncate">{selectedModel.name}</span>
                  <span className="text-[10px] text-[#c8c8c8]">▾</span>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                  side="top"
                  sideOffset={10}
                  className="w-[min(92vw,300px)] rounded-xl border border-[#ffb4002b] bg-[#0b0b0b]/97 p-1.5 text-[#f7ebcf] shadow-[0_16px_40px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
                >
                  <div className="max-h-[300px] space-y-2 overflow-y-auto px-1 pb-1 pt-0.5">
                    {groups.map((group) => (
                      <div key={group.label}>
                        <p className="pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#cda660]">
                          {group.label}
                        </p>
                        <div className="grid grid-cols-1 gap-1">
                          {group.items.map((model) => (
                            <DropdownMenuItem
                              key={model.id}
                              disabled={!model.available}
                              onClick={() => handleModelSelect(model)}
                              className={cn(
                                "flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left",
                                "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-35",
                                selectedModel.id === model.id
                                  ? "bg-[#ffb40014]"
                                  : "hover:bg-white/[0.05]",
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[12px] text-[#f6e8c9]">{model.name}</p>
                                <p className="truncate text-[10px] text-[#c7aa70]">{formatContextWindow(model.contextWindow)} ctx</p>
                              </div>
                              <span className="shrink-0 text-[10px] text-[#e8cb92]">{normalizeMultiplier(model)}</span>
                            </DropdownMenuItem>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {showContext && (
                <DropdownMenu open={contextPanelOpen} onOpenChange={setContextPanelOpen}>
                  <div className="group relative">
                    <DropdownMenuTrigger
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-white/[0.06]"
                      aria-label={`Context usage ${contextLabel}`}
                      title={`${contextUsage?.usedTokens.toLocaleString()} / ${contextUsage?.maxTokens.toLocaleString()} tokens`}
                    >
                      <svg width="22" height="22" viewBox="0 0 22 22" className="rotate-[-90deg]">
                        <circle cx="11" cy="11" r={ringRadius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
                        <circle
                          cx="11"
                          cy="11"
                          r={ringRadius}
                          fill="none"
                          stroke={contextRingColor}
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeDasharray={ringCircumference}
                          strokeDashoffset={ringOffset}
                        />
                      </svg>
                    </DropdownMenuTrigger>
                  </div>

                  <DropdownMenuContent
                    align="end"
                    side="top"
                    sideOffset={10}
                    className="w-[300px] rounded-xl border border-[#ffb4002e] bg-[#0b0b0b]/98 p-3 text-[#f5f5f5] shadow-[0_16px_45px_rgba(0,0,0,0.6)]"
                  >
                    <p className="text-[13px] font-semibold text-[#f5f5f5]">Context Window</p>
                    <div className="mt-1 flex items-center justify-between">
                      <p className="text-[12px] text-[#f0f0f0]">{contextLabel} tokens</p>
                      <p className="text-[12px] text-[#d6d6d6]">{contextPercent.toFixed(1)}%</p>
                    </div>

                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#2a2a2a]">
                      <div
                        className="h-full bg-[repeating-linear-gradient(135deg,#f7c96a_0px,#f7c96a_4px,#f08bd6_4px,#f08bd6_8px)]"
                        style={{ width: `${contextPercent}%` }}
                      />
                    </div>

                    <p className="mt-2 text-[11px] text-[#cecece]">Reserved for response: {reservedPct.toFixed(1)}%</p>

                    <div className="mt-3 space-y-1 text-[12px]">
                      <p className="text-[#f2f2f2]">System</p>
                      <div className="flex items-center justify-between text-[#cfcfcf]">
                        <span>System Instructions</span>
                        <span>{systemInstructionsPct.toFixed(1)}% · {systemTokens.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between text-[#cfcfcf]">
                        <span>Tool Definitions</span>
                        <span>{toolDefinitionsPct.toFixed(1)}% · {toolsTokens.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1 text-[12px]">
                      <p className="text-[#f2f2f2]">User Context</p>
                      <div className="flex items-center justify-between text-[#cfcfcf]">
                        <span>Messages</span>
                        <span>{messagesPct.toFixed(1)}% · {messagesTokens.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between text-[#cfcfcf]">
                        <span>Tool Results</span>
                        <span>{toolResultsPct.toFixed(1)}% · {toolResultsTokens.toLocaleString()}</span>
                      </div>
                    </div>

                    <button
                      onClick={handleCompactFromContext}
                      disabled={!onCompact}
                      className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[#ffb40035] bg-[#141414] px-2.5 py-1.5 text-[12px] text-[#ffdb9a] transition hover:bg-[#1c1c1c] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Minimize2 className="h-3.5 w-3.5" />
                      Compact Conversation
                    </button>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {isStreaming ? (
                <button
                  onClick={onStop}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-500/25 text-red-100 transition hover:bg-red-500/35"
                  title="Stop"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!canSend}
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-full transition",
                    canSend
                      ? "bg-[#ffb400] text-black hover:bg-[#ffc53b]"
                      : "bg-[#2d220d] text-[#7f6533]",
                  )}
                  title="Send"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
