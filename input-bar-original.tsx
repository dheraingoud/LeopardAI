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
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedModel(found);
      } else {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedModel(MODELS.find((m) => m.available) || MODELS[0]);
      }
    }
  }, [chatModel]);

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

  // Detect if pasted text looks like code
  const detectCodePaste = (text: string): AttachedFile | null => {
    if (text.length < 100) return null;

    // Code patterns to detect
    const codePatterns = [
      /\b(function|const|let|var|import|export|class|def|func|fn)\b/,
      /\{[\s\S]*\}/,
      /\[[\s\S]*\]/,
      /(return|if|else|for|while)\s*\(/,
      /=>\s*\{/,
      /^\s*(public|private|async)\s+/m,
    ];

    const isCode = codePatterns.some(p => p.test(text));
    if (!isCode) return null;

    // Derive extension
    let ext = 'js';
    if (/import\s+React|JSX|<\w+[^>]*>/.test(text)) ext = 'tsx';
    else if (/\bdef\s+\w+\s*\(|import\s+\w+\s+from/.test(text)) ext = 'py';
    else if (/\bfunc\s+\w+|package\s+\w+/.test(text)) ext = 'go';
    else if (/interface\s+\w+|type\s+\w+\s*=/.test(text)) ext = 'ts';
    else if (/<\?php|function\s+\w+\s*\(/.test(text)) ext = 'php';

    return {
      name: `pasted-code.${ext}`,
      type: 'text/plain',
      size: text.length,
      textContent: text,
    };
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

    // Handle image files
    if (files.length > 0) {
      e.preventDefault();
      await handleFiles(files);
      // Warn about text models and images
      if (files.some(f => f.type.startsWith('image/'))) {
        toast.warning('Text models cannot analyze images. Describe the image for better results.');
      }
      return;
    }

    // Check for code in text clipboard
    const text = e.clipboardData.getData('text');
    if (text) {
      const codeAttachment = detectCodePaste(text);
      if (codeAttachment) {
        e.preventDefault();
        setAttachedFiles(prev => [...prev, codeAttachment].slice(0, 5));
        toast.success('Code detected - added as attachment');
      }
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
          "bg-[#0a0a0a]/80 backdrop-blur-md",
          "shadow-[0_8px_40px_rgba(0,0,0,0.5),0_2px_12px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]",
          "focus-within:ring-1 focus-within:ring-[#ffb40015]",
          isDragOver
            ? "border-[#ffb400] shadow-[0_0_0_2px_rgba(255,180,0,0.2),0_8px_40px_rgba(255,180,0,0.1)]"
            : "border-white/[0.08] focus-within:border-[#ffb40030] focus-within:shadow-[0_0_0_2px_rgba(255,180,0,0.1),0_0_20px_rgba(255,180,0,0.1),0_8px_40px_rgba(0,0,0,0.5)]"
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

        {/* Attached files preview - positioned above the main pill */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-3 px-4 pt-3">
            {attachedFiles.map((file, i) => (
              <motion.div
                key={`${file.name}-${i}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative group/file flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] max-w-[200px]"
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
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-[#1a1a1a] border border-white/[0.08] flex items-center justify-center opacity-0 group-hover/file:opacity-100 transition-opacity hover:bg-red-500/20"
                >
                  <X className="h-3 w-3 text-[#808080]" />
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {/* Main input pill - single line compact layout */}
        <div className="flex items-end gap-2 p-3">
          {/* Attach file button - left */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="h-9 min-w-9 w-9 flex items-center justify-center rounded-lg text-[#505050] hover:text-[#a3a3a3] hover:bg-white/[0.06] transition-colors shrink-0"
            title="Attach file"
          >
            <Paperclip className="h-4 w-4" />
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

          {/* Textarea - middle, takes remaining space */}
          <div className="flex-1 min-w-0">
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

          {/* Model selector - right side */}
          <DropdownMenu>
            <DropdownMenuTrigger>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[11px] font-mono cursor-pointer select-none transition-all shrink-0",
                  selectedModel.available
                    ? "text-[#888] hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06]"
                    : "text-red-400/60 bg-red-500/5 border border-red-500/10"
                )}
              >
                <Zap className="h-3.5 w-3.5 text-[#ffb400]" />
                <span className="hidden sm:inline">{selectedModel.name}</span>
                <span className="sm:hidden">{selectedModel.name.split(" ")[0]}</span>
                <ChevronDown className="h-3.5 w-3.5 text-[#606060]" />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={8}
              className="border-white/[0.08] backdrop-blur-md bg-[#0a0a0a]/90 shadow-[0_10px_40px_rgba(0,0,0,0.6)] w-[320px] sm:w-[340px] z-[60] p-1"
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

          {/* Send/Stop button */}
          {isStreaming ? (
            <button
              onClick={onStop}
              className="h-9 min-w-9 w-9 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all border border-red-500/15 shrink-0"
              title="Stop"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                "h-9 min-w-9 w-9 flex items-center justify-center rounded-lg transition-all duration-150 shrink-0",
                canSend
                  ? "bg-[#ffb400] text-black hover:bg-[#e6a300] hover:-translate-y-0.5 active:translate-y-0"
                  : "bg-white/[0.04] text-[#404040] cursor-not-allowed"
              )}
              title="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
