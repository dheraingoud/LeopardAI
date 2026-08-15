"use client";

import { memo, useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Copy,
  Check,
  Sparkles,
  RefreshCw,
  Play,
  ChevronDown,
  Brain,
  ExternalLink,
  Code as CodeIcon,
} from "lucide-react";
import { detectArtifacts } from "@/lib/artifact-detector";
import { hydrateMessageImages } from "@/lib/image-cache";
import type { QuickAction } from "@/lib/quick-actions";
import { MODELS, type Artifact } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { parseFileAttachments, AttachmentCard } from "./attachment-card";

/* ─── Types ─── */

interface MessageProps {
  message: {
    _id?: string;
    role: "user" | "assistant" | "system";
    content: string;
    model?: string;
    createdAt: number;
  };
  index: number;
  isStreaming?: boolean;
  streamedContent?: string;
  onOpenArtifact?: (artifact: Artifact) => void;
  onRegenerate?: () => void;
  onQuickAction?: (action: QuickAction, code: string, lang: string) => void;
  isLast?: boolean;
  userAvatar?: string;
}

/* ─── Recursively extract text from React children ─── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText(node: any): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && node.props) {
    return extractText(node.props.children);
  }
  return "";
}

/* ─── Parse _kses tags from model output ─── */

function parseThinking(content: string): {
  thinking: string | null;
  response: string;
} {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  const thinkingParts: string[] = [];

  let match;
  while ((match = thinkRegex.exec(content)) !== null) {
    const thought = match[1].trim();
    if (thought) thinkingParts.push(thought);
  }

  if (thinkingParts.length > 0) {
    const cleaned = content.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
    return { thinking: thinkingParts.join("\n\n"), response: cleaned };
  }

  // Streaming: opening <think> without closing tag
  const openMatch = content.match(/^<think>([\s\S]*)$/);
  if (openMatch) {
    return { thinking: openMatch[1].trim(), response: "" };
  }

  // Mid-stream partial
  const partialOpen = content.match(/([\s\S]*)<think>([\s\S]*)$/);
  if (partialOpen) {
    return { thinking: partialOpen[2].trim(), response: partialOpen[1].trim() };
  }

  return { thinking: null, response: content };
}

function artifactTypeFromLanguage(language?: string): Artifact["type"] {
  const lang = (language || "").toLowerCase();
  if (["tsx", "jsx", "react"].includes(lang)) return "react";
  if (lang === "html") return "html";
  if (lang === "svg") return "svg";
  if (["markdown", "md"].includes(lang)) return "markdown";
  if (lang === "csv") return "csv";
  if (lang === "mermaid") return "mermaid";
  if (lang === "json") return "json";
  return "code";
}

function buildAttachmentArtifact(
  messageId: string | undefined,
  filename: string,
  language: string,
  content: string,
  index: number,
): Artifact {
  const inferredLanguage = language || filename.split(".").pop() || "text";
  return {
    id: `attachment-${messageId || "msg"}-${index}`,
    type: artifactTypeFromLanguage(inferredLanguage),
    title: filename,
    content,
    language: inferredLanguage,
  };
}

/* ─── Collapsible Thinking Block ─── */

function ThinkingBlock({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  // Default expanded while the model is reasoning (so the user can read the
  // process live); collapse once the final answer starts streaming.
  const [expanded, setExpanded] = useState(true);
  const [hasFinished, setHasFinished] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Ref-tracked start; compute elapsedMs once on stream-end. Avoids the
  // ~10 re-renders/sec a setInterval(100ms) ticker would cost during a long
  // reasoning phase (the parent in /share/[shareId] still hands us this
  // content verbatim — no need to blast renders for live display).
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (isStreaming && startRef.current === null) {
      startRef.current = performance.now();
      setElapsedMs(0);
    } else if (!isStreaming && startRef.current !== null) {
      setElapsedMs(Math.round(performance.now() - startRef.current));
      startRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  // Auto-collapse when streaming stops and final answer begins.
  useEffect(() => {
    if (!isStreaming && !hasFinished) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpanded(false);
      setHasFinished(true);
    }
  }, [isStreaming, hasFinished]);

  const seconds = (elapsedMs / 1000).toFixed(1);
  const charCount = content.length;

  return (
    <div
      className={cn(
        "my-3 overflow-hidden rounded-2xl",
        "border dark:border-white/[0.06] light:border-black/[0.08]",
        // Card-within-a-card feel: two-stop gradient on dark with a soft amber
        // wash, paper-toned warmth on light. Inner highlight simulates an edge
        // bevel without resorting to drop shadows.
        "dark:bg-[linear-gradient(160deg,rgba(255,180,0,0.05)_0%,rgba(255,255,255,0.02)_50%,rgba(255,255,255,0.015)_100%)]",
        "light:bg-[linear-gradient(160deg,rgba(255,180,0,0.06)_0%,rgba(255,255,255,0.65)_60%)]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
      )}
    >
     <button
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          "group flex w-full items-center gap-2.5 px-4 py-2.5 text-left",
          "transition-colors duration-200",
          "hover:dark:bg-white/[0.02] light:hover:bg-black/[0.02]",
        )}
      >
        <Brain
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-colors duration-300",
            isStreaming ? "text-[#ffb400]" : "text-[#606060]",
          )}
        />
        <span
          className={cn(
            "text-[11px] font-semibold uppercase tracking-[0.16em]",
            isStreaming ? "text-[#ffb400]" : "text-[#909090]",
          )}
        >
          {isStreaming ? "Thinking" : "Thought process"}
      </span>

        <span className="ml-1 flex items-center gap-1.5 text-[10px] font-mono text-[#606060] tabular-nums">
          {isStreaming && (
            <motion.span
              className="inline-block h-1.5 w-1.5 rounded-full bg-[#ffb400]"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.9, 1.1, 0.9] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
          <span>{seconds}s</span>
          <span className="text-[#404040]">{"·"}</span>
          <span>{charCount.toLocaleString()} chars</span>
      </span>

        <span className="flex-1" />

        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-[#606060] transition-transform duration-300 ease-out",
            !expanded && "-rotate-90",
          )}
        />
    </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                "border-t px-4 pb-3.5 pt-1 pl-5",
                "dark:border-white/[0.05] light:border-black/[0.06]",
                "max-h-[420px] overflow-y-auto",
                "text-[13.5px] leading-[1.7] tracking-[-0.005em]",
                "dark:text-[#9a9a9a] light:text-[#404040]",
                "whitespace-pre-wrap break-words",
              )}
            >
              {content}
          </div>
        </motion.div>
        )}
    </AnimatePresence>
  </div>
  );
}

function CodeBlock({
  code,
  lang,
  onPreview,
  onQuickAction,
}: {
  code: string;
  lang: string;
  onPreview?: (code: string, lang: string) => void;
  onQuickAction?: (action: QuickAction, code: string, lang: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const lines = code.split("\n");
  const lineCount = lines.length;
  const isPreviewable =
    ["html", "jsx", "tsx", "react", "svg", "markdown", "md", "mermaid", "csv"].includes(lang) &&
    lineCount > 3;
  const isExecutable = ["javascript", "js", "typescript", "ts", "jsx", "tsx"].includes(lang);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-4 rounded-xl overflow-hidden border dark:border-white/[0.06] light:border-black/[0.06] bg-[#0c0c0c] hover:dark:border-white/[0.15] light:border-black/[0.1] transition-colors duration-300">
      <div className="flex items-center justify-between px-4 py-2 dark:bg-white/[0.03] light:bg-black/[0.02] border-b dark:border-white/[0.06] light:border-black/[0.06] transition-colors duration-200 hover:dark:bg-white/[0.05] light:bg-black/[0.04]">
        <div className="flex items-center gap-2">
          <CodeIcon className="h-3.5 w-3.5 dark:text-[#505050] light:text-[#737373]" />
          <span className="text-[12px] font-mono dark:text-[#707070] light:text-[#808080] capitalize px-1.5 py-0.5 rounded dark:bg-white/[0.03] light:bg-black/[0.02] border dark:border-white/[0.03] light:border-black/[0.04]">
            {lang || "Code"}
         </span>
       </div>
        <div className="flex items-center gap-1">
          {isExecutable && (
            <button
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-[#22c55e] hover:bg-[#22c55e15] transition-colors disabled:opacity-50"
              onClick={() => onQuickAction?.("run", code, lang)}
              title="Run code"
            >
              <Play className="h-3 w-3" />
              Run
           </button>
          )}
          <button
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-[#606060] hover:text-[#ffb400] hover:bg-[#ffb40008] transition-colors"
            onClick={() => onQuickAction?.("tests", code, lang)}
            title="Generate tests"
          >
            <Sparkles className="h-3 w-3" />
         </button>
          <button
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-[#606060] hover:text-[#ffb400] hover:bg-[#ffb40008] transition-colors"
            onClick={() => onQuickAction?.("flow-current", code, lang)}
            title="Generate current flowchart"
          >
            Flow
         </button>
          <button
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-[#606060] hover:text-[#ffb400] hover:bg-[#ffb40008] transition-colors"
            onClick={() => onQuickAction?.("audit", code, lang)}
            title="Audit code"
          >
            Audit
         </button>
          {isPreviewable && onPreview && (
            <button
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-[#ffb400] bg-[#ffb40008] hover:bg-[#ffb40015] transition-colors"
              onClick={() => onPreview(code, lang)}
            >
              <ExternalLink className="h-3 w-3" />
           </button>
          )}
          <button
            className="flex items-center justify-center h-6 w-6 rounded-md dark:text-[#505050] light:text-[#737373] hover:dark:text-white light:text-[#171717] hover:dark:bg-white/[0.06] light:bg-black/[0.04] hover-lift transition-all duration-200 ease-in-out"
            onClick={handleCopy}
            title="Copy code"
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-400" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
         </button>
       </div>
     </div>
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <pre
          style={{
            margin: 0,
            padding: "20px",
            background: "transparent",
            border: "none",
            borderRadius: 0,
            whiteSpace: "pre",
            overflowWrap: "normal",
            wordBreak: "normal",
          }}
        >
          <code
            style={{
              display: "block",
              whiteSpace: "pre",
              fontFamily: '"Iosevka Charon", "SF Mono", "Fira Code", monospace',
              fontSize: "14px",
              lineHeight: "1.65",
              color: "#d4d4d4",
              tabSize: 2,
            }}
          >
            {code}
         </code>
       </pre>
     </div>
   </div>
  );
}

/* ─── Thinking indicator (waiting for first token) ─── */

export function ThinkingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
      className="max-w-3xl mx-auto"
    >
      <div className="flex items-start gap-3 py-5">
        <div className="flex flex-col gap-2 pt-0.5">
          <span className="text-[12px] font-mono dark:text-[#505050] light:text-[#737373] light:text-[#737373]">
            Leopard
          </span>
          <div className="flex items-center gap-3">
            <div className="flex gap-[3px]">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-[7px] h-[7px] rounded-full bg-[#ffb400]"
                  animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.15,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
            <span className="text-[14px] dark:text-[#505050] light:text-[#737373] light:text-[#737373]">Working on it…</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Main Message Component ─── */

function MessageComponent({
  message,
  isStreaming,
  streamedContent,
  onOpenArtifact,
  onRegenerate,
  onQuickAction,
  isLast,
}: MessageProps) {
  const isUser = message.role === "user";
  const [hydratedContent, setHydratedContent] = useState(message.content);
  const baseContent = message._id ? hydratedContent : message.content;
  const rawContent = isStreaming && streamedContent ? streamedContent : baseContent;
  const [msgCopied, setMsgCopied] = useState(false);

  useEffect(() => {
    if (isStreaming) return;

    const messageId = message._id ? String(message._id) : null;
    if (!messageId) return;

    let disposed = false;
    void hydrateMessageImages(messageId, message.content)
      .then((resolved) => {
        if (!disposed) setHydratedContent(resolved);
      })
      .catch(() => {
        if (!disposed) setHydratedContent(message.content);
      });

    return () => {
      disposed = true;
    };
  }, [isStreaming, message._id, message.content]);

  // Auto-open flowchart once streaming finishes
  const [wasStreaming, setWasStreaming] = useState(isStreaming);
  useEffect(() => {
    if (isStreaming) {
      setWasStreaming(true);
    }
  }, [isStreaming]);

  // Extract attachments and clean content
  const { attachments, cleanContent } = useMemo(
    () => parseFileAttachments(rawContent),
    [rawContent]
  );

  const { thinking, response: displayContent } = useMemo(() => {
    const { thinking, response } = parseThinking(cleanContent);
    return isUser
      ? { thinking: null, response: cleanContent }
      : { thinking, response };
  }, [cleanContent, isUser]);

  const modelLabel = useMemo(() => {
    if (!message.model) return null;
    const fromId = MODELS.find((entry) => entry.id === message.model);
    if (fromId) return fromId.name;
    const fromNim = MODELS.find((entry) => entry.nimId === message.model);
    return fromNim?.name || message.model;
  }, [message.model]);

  const userImageUrls = useMemo(() => {
    if (!isUser || !displayContent) return [] as string[];
    const regex = /!\[[^\]]*\]\((https?:\/\/[^\s)]+|data:image\/[^)\s]+|blob:[^)\s]+)\)/gi;
    const urls: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(displayContent)) !== null) {
      urls.push(match[1]);
    }
    return urls;
  }, [displayContent, isUser]);

  const userTextContent = useMemo(() => {
    if (!isUser || !displayContent) return displayContent;
    return displayContent
      .replace(/!\[[^\]]*\]\((https?:\/\/[^\s)]+|data:image\/[^)\s]+|blob:[^)\s]+)\)/gi, "")
      .replace(/<!--\s*img:[^>]+-->/gi, "")
      .trim();
  }, [displayContent, isUser]);

  const artifacts = useMemo(
    () => (!isUser && displayContent ? detectArtifacts(displayContent) : []),
    [displayContent, isUser]
  );

  useEffect(() => {
    if (wasStreaming && !isStreaming) {
      if (artifacts.length > 0) {
        const flows = artifacts.filter(a => a.type === "mermaid");
        if (flows.length > 0 && onOpenArtifact) {
          onOpenArtifact(flows[0]);
        }
      }
      setWasStreaming(false); // Prevents re-running
    }
  }, [isStreaming, wasStreaming, artifacts, onOpenArtifact]);

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(displayContent);
    setMsgCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setMsgCopied(false), 2000);
  };

  const handlePreview = (code: string, lang: string) => {
    let artifactType: Artifact["type"];
    if (["jsx", "tsx", "react"].includes(lang)) artifactType = "react";
    else if (lang === "svg") artifactType = "svg";
    else if (["markdown", "md"].includes(lang)) artifactType = "markdown";
    else if (lang === "mermaid") artifactType = "mermaid";
    else if (lang === "csv") artifactType = "csv";
    else artifactType = "html";

    onOpenArtifact?.({
      id: `preview-${Date.now()}`,
      type: artifactType,
      title: `${lang.toUpperCase()} Preview`,
      content: code,
      language: lang,
    });
  };

  /* ─── User message ─── */
  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
        className="flex justify-end py-3"
      >
        <div className="max-w-[80%] rounded-2xl border border-[#ffb40024] bg-[linear-gradient(145deg,#1f1607_0%,#171006_50%,#110c05_100%)] px-5 py-3 text-[#f6e8cc] shadow-[0_10px_30px_rgba(0,0,0,0.32)]">
          {userImageUrls.length > 0 && (
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 mb-2">
              {userImageUrls.map((url, idx) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${url.slice(0, 32)}-${idx}`}
                  src={url}
                  alt={`Attached ${idx + 1}`}
                  className="max-h-[240px] w-full object-cover rounded-xl border dark:border-white/[0.12] light:border-black/[0.1]"
                  loading="lazy"
                />
              ))}
            </div>
          )}

          {/* Render attachments as cards */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map((att, i) => (
                <AttachmentCard
                  key={`${att.filename}-${i}`}
                  filename={att.filename}
                  language={att.language}
                  content={att.content}
                  onOpenCanvas={() =>
                    onOpenArtifact?.(
                      buildAttachmentArtifact(message._id ? String(message._id) : undefined, att.filename, att.language, att.content, i),
                    )
                  }
                />
              ))}
            </div>
          )}
          {/* Render clean message text */}
          {userTextContent && (
            <p className="text-[15px] leading-[1.6] whitespace-pre-wrap">
              {userTextContent}
            </p>
          )}
        </div>
      </motion.div>
    );
  }

  /* ─── Assistant message ─── */
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.03, ease: [0.25, 1, 0.5, 1] }}
      className="group py-5"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Name */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[12px] font-mono dark:text-[#505050] light:text-[#737373] light:text-[#737373]">
              leopard
            </span>
            {modelLabel && (
              <span className="text-[10px] font-mono text-[#7e7e7e] dark:bg-white/[0.03] light:bg-black/[0.02] border dark:border-white/[0.06] light:border-black/[0.06] px-1.5 py-0.5 rounded-md">
                {modelLabel}
              </span>
            )}
          </div>

          {/* Thinking block */}
          {thinking && (
            <ThinkingBlock
              content={thinking}
              isStreaming={isStreaming && !displayContent}
            />
          )}

          {/* Render attachments as cards */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {attachments.map((att, i) => (
                <AttachmentCard
                  key={`${att.filename}-${i}`}
                  filename={att.filename}
                  language={att.language}
                  content={att.content}
                  onOpenCanvas={() =>
                    onOpenArtifact?.(
                      buildAttachmentArtifact(message._id ? String(message._id) : undefined, att.filename, att.language, att.content, i),
                    )
                  }
                />
              ))}
            </div>
          )}

          {/* Main response */}
          {displayContent && (
            <div className="markdown-body text-[15px] leading-[1.75] text-[#dedede]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                urlTransform={(url) => url}
                components={{
                  /* Block code: extract raw text, render with CodeBlock */
                  pre({ node: _node, ref: _ref, children, ...props }) {
                    // Safely inspect the child <code> element for language class
                    const codeChild = Array.isArray(children)
                      ? children[0]
                      : children;
                    const codeObj =
                      codeChild != null &&
                      typeof codeChild === "object" &&
                      "props" in (codeChild as object)
                        ? (codeChild as Record<string, unknown>)
                        : null;
                    const codeProps =
                      codeObj &&
                      typeof codeObj.props === "object" &&
                      codeObj.props
                        ? (codeObj.props as Record<string, unknown>)
                        : null;
                    const className =
                      typeof codeProps?.className === "string"
                        ? codeProps.className
                        : "";
                    if (className.includes("language-")) {
                      const langMatch = className.match(/language-(\w+)/);
                      const lang = langMatch ? langMatch[1] : "";
                      const rawText = extractText(codeProps?.children).replace(/\n$/, "");
                      return (
                        <CodeBlock
                          code={rawText}
                          lang={lang}
                          onPreview={handlePreview}
                          onQuickAction={onQuickAction}
                        />
                      );
                    }
                    // Fallback: plain pre block
                    return (
                      <pre
                        style={{
                          whiteSpace: "pre-wrap",
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          borderRadius: "12px",
                          padding: "20px",
                          margin: "16px 0",
                        }}
                        {...props}
                      >
                        {children}
                      </pre>
                    );
                  },
                  /* Inline code */
                  code({ node: _node, ref: _ref, className, children, ...props }) {
                    return (
                      <code
                        className={cn(
                          className,
                          "text-[12px] font-mono dark:text-[#505050] light:text-[#737373] light:text-[#737373] px-1.5 py-0.5 rounded dark:bg-white/[0.06] light:bg-black/[0.04] text-[#e8b940]"
                        )}
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  /* Table */
                  table({ children }) {
                    return (
                      <div className="overflow-x-auto my-4 rounded-lg border dark:border-white/[0.06] light:border-black/[0.06]">
                        <table className="w-full text-[12px] font-mono dark:text-[#505050] light:text-[#737373] light:text-[#737373]">{children}</table>
                      </div>
                    );
                  },
                  th({ children }) {
                    return (
                      <th className="px-3 py-2 dark:bg-white/[0.03] light:bg-black/[0.02] text-left text-[12px] font-mono text-[#808080] border-b dark:border-white/[0.06] light:border-black/[0.06]">
                        {children}
                      </th>
                    );
                  },
                  td({ children }) {
                    return (
                      <td className="px-3 py-2 border-b dark:border-white/[0.03] light:border-black/[0.04] text-[#b0b0b0]">
                        {children}
                      </td>
                    );
                  },
                  /* Links */
                  a({ href, children }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#ffb400] hover:text-[#ffc940] underline underline-offset-2 decoration-[#ffb400]/30 inline-flex items-center gap-0.5"
                      >
                        {children}
                        <ExternalLink className="h-3 w-3 inline opacity-50" />
                      </a>
                    );
                  },
                  img({ src, alt }) {
                    if (!src) return null;
                    // eslint-disable-next-line @next/next/no-img-element
                    return (
                      <img
                        src={src}
                        alt={alt || "Generated image"}
                        className="my-3 max-w-full rounded-xl border dark:border-white/[0.08] light:border-black/[0.08]"
                        loading="lazy"
                      />
                    );
                  },
                  /* Blockquotes */
                  blockquote({ children }) {
                    return (
                      <blockquote className="border-l-2 border-[#ffb400]/30 pl-4 my-3 text-[#808080] italic">
                        {children}
                      </blockquote>
                    );
                  },
                }}
              >
                {displayContent}
              </ReactMarkdown>
            </div>
          )}

          {/* Streaming cursor */}
          {isStreaming && displayContent && (
            <motion.span
              className="inline-block w-[6px] h-[16px] bg-[#ffb400] rounded-[1px] ml-0.5 align-text-bottom"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
          )}

          {/* Action bar — appears on hover */}
          {!isStreaming && displayContent && (
            <div className="flex items-center gap-0.5 mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <button
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-[#353535] hover:dark:text-[#e5e5e5] light:text-[#262626] hover:dark:bg-white/[0.04] light:bg-black/[0.03] hover-lift transition-colors"
                onClick={handleCopyMessage}
              >
                {msgCopied ? (
                  <>
                    <Check className="h-3 w-3 text-green-400" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" /> Copy
                  </>
                )}
              </button>

              {isLast && onRegenerate && (
                <button
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-[#353535] hover:dark:text-[#e5e5e5] light:text-[#262626] hover:dark:bg-white/[0.04] light:bg-black/[0.03] hover-lift transition-colors"
                  onClick={onRegenerate}
                >
                  <RefreshCw className="h-3 w-3" /> Regenerate
                </button>
              )}

              {/* Canvas buttons for substantial previewable artifacts */}
              {artifacts
                .filter((a) => a.content.split("\n").length > 5)
                .map((a) => (
                  <button
                    key={a.id}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono text-[#ffb400]/70 hover:text-[#ffb400] hover:bg-[#ffb40008] transition-colors"
                    onClick={() => onOpenArtifact?.(a)}
                  >
                    <Play className="h-3 w-3" /> {a.title}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default memo(MessageComponent);
