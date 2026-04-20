"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Code,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AttachmentCardProps {
  filename: string;
  content: string;
  language?: string;
  size?: number;
  isPreview?: boolean;
  onOpenCanvas?: () => void;
}

const LANGUAGE_ICONS: Record<string, typeof Code> = {
  tsx: Code,
  ts: Code,
  jsx: Code,
  js: Code,
  py: FileText,
  json: FileText,
  md: FileText,
  html: Code,
  css: Code,
};

const LANGUAGE_LABELS: Record<string, string> = {
  tsx: "TypeScript React",
  ts: "TypeScript",
  jsx: "JavaScript React",
  js: "JavaScript",
  py: "Python",
  json: "JSON",
  md: "Markdown",
  txt: "Text",
  csv: "CSV",
  tsv: "TSV",
  doc: "Word",
  docx: "Word",
  xls: "Excel",
  xlsx: "Excel",
  pdf: "PDF",
  html: "HTML",
  css: "CSS",
};

function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()?.toLowerCase() || "" : "";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentCard({
  filename,
  content,
  language,
  size,
  isPreview = false,
  onOpenCanvas,
}: AttachmentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const ext = language || getFileExtension(filename);
  const Icon = LANGUAGE_ICONS[ext] || FileText;
  const label = LANGUAGE_LABELS[ext] || "Document";
  const extensionTag = ext ? ext.toUpperCase() : "FILE";
  const contentAvailable = content.trim().length > 0;

  const handleCopy = () => {
    if (!contentAvailable) {
      toast.info("No text content is available to copy for this attachment.");
      return;
    }

    navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!contentAvailable) {
      toast.info("Binary attachment metadata is available, but raw content is not stored.");
      return;
    }

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lineCount = contentAvailable ? content.split("\n").length : 0;
  const canExpand = contentAvailable && !isPreview && lineCount > 5 && !onOpenCanvas;

  const handlePrimaryAction = () => {
    if (onOpenCanvas) {
      onOpenCanvas();
      return;
    }

    if (canExpand) {
      setExpanded((prev) => !prev);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "my-3 rounded-xl border overflow-hidden",
        "bg-[#0c0c0c] border-white/[0.08]",
        onOpenCanvas && "cursor-pointer hover:border-[#ffb40050] hover:bg-[#131313]",
        expanded && "border-[#ffb40020]"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3",
          "bg-white/[0.02]",
          (canExpand || onOpenCanvas) && "cursor-pointer hover:bg-white/[0.04]",
          "transition-colors"
        )}
        onClick={handlePrimaryAction}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg border border-white/[0.08] bg-white/[0.03] flex items-center justify-center">
            <Icon className="h-4 w-4 text-[#cfcfcf]" />
          </div>
          <div>
            <p className="text-[14px] font-medium text-[#f0f0f0]">{filename}</p>
            <p className="text-[11px] text-[#505050]">
              {label} • {extensionTag}
              {size && ` • ${formatFileSize(size)}`}
              {lineCount > 0 && ` • ${lineCount} lines`}
              {onOpenCanvas && " • open in canvas"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {canExpand && (
            <div className="mr-1">
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-[#606060]" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[#606060]" />
              )}
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
            className="inline-flex items-center gap-1 rounded-md border border-white/[0.12] px-2.5 py-1.5 text-[12px] text-[#e6e6e6] hover:bg-white/[0.06] transition-colors"
            title="Download file"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
          {contentAvailable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              className="p-2 rounded-md hover:bg-white/[0.06] text-[#505050] hover:text-[#a3a3a3] transition-colors"
              title="Copy content"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Expandable content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="border-t border-white/[0.06]">
              <pre className="p-4 text-[13px] font-mono text-[#a3a3a3] overflow-x-auto max-h-[400px] overflow-y-auto">
                <code>{content}</code>
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Detect file attachment pattern in content ─── */
export function parseFileAttachments(content: string): {
  attachments: Array<{ filename: string; language: string; content: string }>;
  cleanContent: string;
} {
  const attachments: Array<{
    filename: string;
    language: string;
    content: string;
  }> = [];

  // Pattern for code blocks that start with a file comment
  // ```tsx
  // // filename.tsx
  // ...content...
  // ```
  const codeBlockWithFile = /```(\w+)\n\/\/\s+([^\n]+)\n([\s\S]*?)```/g;

  const withoutCodeAttachments = content.replace(codeBlockWithFile, (match, language, filename, codeContent) => {
    // Check if this looks like a file attachment (has extension)
    if (filename && filename.includes(".")) {
      attachments.push({
        filename: filename.trim(),
        language,
        content: codeContent.trim(),
      });
      return "";
    }
    return match;
  });

  // Also parse plain file markers produced by non-text attachments: [File: name.ext (size)]
  const fileTagPattern = /\[File:\s*([^\]\n]+?)\]/g;
  const cleanContent = withoutCodeAttachments.replace(fileTagPattern, (_match, rawValue: string) => {
    const normalized = String(rawValue).trim();
    const stripped = normalized.replace(/\s*\([^)]*\)\s*$/, "");
    const filename = stripped.trim();
    if (!filename || !filename.includes(".")) return _match;

    attachments.push({
      filename,
      language: getFileExtension(filename),
      content: "",
    });
    return "";
  });

  return { attachments, cleanContent };
}
