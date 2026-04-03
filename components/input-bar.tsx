"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import TextareaAutosize from "react-textarea-autosize";
import {
  Send,
  ChevronDown,
  Square,
  AlertCircle,
  Zap,
  Paperclip,
  X,
  Image as ImageIcon,
  FileText,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MODELS, type Model } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface InputBarProps {
  onSend: (message: string, model: string) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  chatModel?: string;
}

interface AttachedFile {
  name: string;
  type: string;
  size: number;
  preview?: string; // data URL for images
  textContent?: string; // text content for text files
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function InputBar({
  onSend,
  onStop,
  isStreaming = false,
  disabled = false,
  placeholder = "Message Leopard…",
  chatModel,
}: InputBarProps) {
  const [message, setMessage] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedModel, setSelectedModel] = useState<Model>(() => {
    if (chatModel) {
      const found = MODELS.find((m) => m.id === chatModel);
      if (found && found.available) return found;
    }
    return MODELS.find((m) => m.available) || MODELS[0];
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync model when navigating between chats
  useEffect(() => {
    if (chatModel) {
      const found = MODELS.find((m) => m.id === chatModel);
      if (found && found.available) {
        setSelectedModel(found);
      } else {
        setSelectedModel(MODELS.find((m) => m.available) || MODELS[0]);
      }
    }
  }, [chatModel]);

  // Keyboard shortcuts: Cmd+N (new chat) and Cmd+K (focus search) are handled at layout level
  // Focus shortcut: pressing / focuses the input
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, []);

  const processFile = async (file: File): Promise<AttachedFile | null> => {
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      toast.error(`${file.name} is too large (max 10MB)`);
      return null;
    }

    const attached: AttachedFile = {
      name: file.name,
      type: file.type,
      size: file.size,
    };

    if (file.type.startsWith("image/")) {
      // Read as data URL for preview
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      attached.preview = dataUrl;
      attached.textContent = `[Image: ${file.name}]`;
    } else if (
      file.type.startsWith("text/") ||
      file.name.match(/\.(json|md|csv|yaml|yml|xml|ts|tsx|js|jsx|py|java|c|cpp|rs|go|sql|sh|bash|html|css|scss)$/i)
    ) {
      // Read text content
      attached.textContent = await file.text();
    } else {
      attached.textContent = `[File: ${file.name} (${formatFileSize(file.size)})]`;
    }

    return attached;
  };

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).slice(0, 5); // Max 5 files
    const processed = await Promise.all(fileArray.map(processFile));
    const valid = processed.filter(Boolean) as AttachedFile[];
    setAttachedFiles((prev) => [...prev, ...valid].slice(0, 5));
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    const hasContent = trimmed || attachedFiles.length > 0;
    if (!hasContent || disabled || isStreaming) return;
    if (!selectedModel.available) {
      toast.error(`${selectedModel.name} is currently unavailable`);
      return;
    }

    // Build message with attached file contents
    let fullMessage = trimmed;
    if (attachedFiles.length > 0) {
      const fileContents = attachedFiles
        .map((f) => {
          if (f.textContent && f.textContent.startsWith("[")) return f.textContent;
          if (f.textContent) return `\`\`\`${f.name.split('.').pop() || 'text'}\n// ${f.name}\n${f.textContent}\n\`\`\``;
          return `[File: ${f.name}]`;
        })
        .join("\n\n");
      fullMessage = fullMessage
        ? `${fullMessage}\n\n${fileContents}`
        : fileContents;
    }

    onSend(fullMessage, selectedModel.id);
    setMessage("");
    setAttachedFiles([]);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [message, attachedFiles, disabled, isStreaming, onSend, selectedModel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      await handleFiles(e.dataTransfer.files);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      await handleFiles(files);
    }
  };

  const canSend =
    (message.trim().length > 0 || attachedFiles.length > 0) &&
    !disabled &&
    !isStreaming &&
    selectedModel.available;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "rounded-2xl border transition-all duration-200 relative",
          "bg-[#0e0e0e]",
          isDragOver
            ? "border-[#ffb400] shadow-[0_0_0_2px_rgba(255,180,0,0.15)]"
            : "border-white/[0.06] focus-within:border-[#ffb40025] focus-within:shadow-[0_0_0_1px_rgba(255,180,0,0.08)]"
        )}
      >
        {/* Drag overlay */}
        <AnimatePresence>
          {isDragOver && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[#ffb40008] border-2 border-dashed border-[#ffb40040]"
            >
              <p className="text-[13px] font-mono text-[#ffb400]">
                Drop files here
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Attached files preview */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {attachedFiles.map((file, i) => (
              <motion.div
                key={`${file.name}-${i}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative group/file flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] max-w-[200px]"
              >
                {file.preview ? (
                  <img
                    src={file.preview}
                    alt={file.name}
                    className="h-6 w-6 rounded object-cover"
                  />
                ) : (
                  <FileText className="h-4 w-4 text-[#606060] shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-[11px] font-mono text-[#a3a3a3] truncate">
                    {file.name}
                  </p>
                  <p className="text-[9px] font-mono text-[#404040]">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <button
                  onClick={() => removeFile(i)}
                  className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-[#1a1a1a] border border-white/[0.08] flex items-center justify-center opacity-0 group-hover/file:opacity-100 transition-opacity hover:bg-red-500/20"
                >
                  <X className="h-2.5 w-2.5 text-[#808080]" />
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {/* Textarea */}
        <div className="px-4 pt-3 pb-2">
          <TextareaAutosize
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={disabled || isStreaming}
            minRows={1}
            maxRows={8}
            className={cn(
              "w-full resize-none bg-transparent text-[14px] text-[#e5e5e5] placeholder:text-[#3a3a3a]",
              "outline-none leading-[1.6]",
              "disabled:opacity-50"
            )}
          />
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 pb-2.5">
          <div className="flex items-center gap-1.5">
            {/* Attach file */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-[#3a3a3a] hover:text-[#808080] hover:bg-white/[0.04] transition-colors"
              title="Attach file"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.txt,.md,.json,.csv,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.rs,.go,.sql,.yaml,.yml,.xml,.sh"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                e.target.value = ""; // reset
              }}
            />

            {/* Model selector */}
            <DropdownMenu>
              <DropdownMenuTrigger>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-mono cursor-pointer select-none transition-all",
                    selectedModel.available
                      ? "text-[#888] hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06]"
                      : "text-red-400/60 bg-red-500/5 border border-red-500/10"
                  )}
                >
                  <Zap className="h-3 w-3 text-[#ffb400]" />
                  <span className="hidden sm:inline">{selectedModel.name}</span>
                  <span className="sm:hidden">{selectedModel.name.split(" ")[0]}</span>
                  <ChevronDown className="h-3 w-3 text-[#555]" />
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="top"
                sideOffset={8}
                className="border-white/[0.08] bg-[#0a0a0a] shadow-[0_10px_40px_rgba(0,0,0,0.6)] w-[320px] sm:w-[340px] z-[60] p-1"
              >
                <div className="px-2.5 py-1.5 mb-1">
                  <p className="text-[10px] font-mono text-[#505050] uppercase tracking-widest">
                    Models
                  </p>
                </div>
                {MODELS.map((model) => (
                  <DropdownMenuItem
                    key={model.id}
                    disabled={!model.available}
                    className={cn(
                      "text-xs gap-3 py-2.5 px-2.5 rounded-lg transition-colors mb-0.5 cursor-pointer",
                      !model.available && "opacity-35 cursor-not-allowed",
                      selectedModel.id === model.id && model.available
                        ? "bg-[#ffb40006] border border-[#ffb40010]"
                        : model.available
                        ? "hover:bg-white/[0.03]"
                        : ""
                    )}
                    onClick={() => {
                      if (model.available) setSelectedModel(model);
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-[12px] font-medium",
                            !model.available
                              ? "text-[#404040]"
                              : selectedModel.id === model.id
                              ? "text-[#ffb400]"
                              : "text-[#d4d4d4]"
                          )}
                        >
                          {model.name}
                        </span>
                        <span className="text-[10px] text-[#404040]">
                          {model.provider}
                        </span>
                        {model.badge && model.available && (
                          <span className="text-[8px] px-1.5 py-[1px] rounded-full bg-[#ffb40008] text-[#ffb400] border border-[#ffb40012]">
                            {model.badge}
                          </span>
                        )}
                        {!model.available && (
                          <span className="text-[8px] px-1.5 py-[1px] rounded-full bg-red-500/5 text-red-400/40 border border-red-500/8 flex items-center gap-0.5">
                            <AlertCircle className="h-2 w-2" /> Offline
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[#3a3a3a] mt-0.5 truncate">
                        {model.description}
                      </p>
                    </div>
                    {model.available && (
                      <span
                        className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded-full shrink-0 border",
                          model.speed === "fast"
                            ? "bg-emerald-500/8 text-emerald-400/80 border-emerald-500/10"
                            : model.speed === "slow"
                            ? "bg-red-500/8 text-red-400/80 border-red-500/10"
                            : "bg-amber-500/8 text-amber-400/80 border-amber-500/10"
                        )}
                      >
                        {model.speed}
                      </span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#2a2a2a] font-mono hidden sm:block">
              <kbd className="text-[#3a3a3a]">↵</kbd> send
            </span>
            {isStreaming ? (
              <button
                onClick={onStop}
                className="h-7 w-7 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all border border-red-500/15"
                title="Stop"
              >
                <Square className="h-3 w-3 fill-current" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!canSend}
                className={cn(
                  "h-7 w-7 flex items-center justify-center rounded-lg transition-all duration-150",
                  canSend
                    ? "bg-[#ffb400] text-black hover:bg-[#e6a300]"
                    : "bg-white/[0.04] text-[#2a2a2a] cursor-not-allowed"
                )}
                title="Send"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
