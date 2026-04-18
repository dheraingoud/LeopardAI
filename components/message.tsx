"use client";

import { memo, useState, useMemo, useEffect } from "react";
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
  ChevronRight,
  Brain,
  ExternalLink,
  Code as CodeIcon,
} from "lucide-react";
import { detectArtifacts } from "@/lib/artifact-detector";
import { executeCode, ExecutionResult } from "@/lib/code-executor";
import { hydrateMessageImages } from "@/lib/image-cache";
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
  onQuickAction?: (action: "explain" | "tests" | "run", code: string, lang: string) => void;
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

/* ─── Collapsible Thinking Block ─── */

function ThinkingBlock({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [hasFinished, setHasFinished] = useState(false);

  // Auto-collapse when streaming stops (or when final answer starts)
  useEffect(() => {
    if (!isStreaming && !hasFinished) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpanded(false);
      setHasFinished(true);
    }
  }, [isStreaming, hasFinished]);

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[12px] text-[#606060] hover:text-[#909090] transition-colors py-1"
      >
        <Brain className="h-3.5 w-3.5 text-[#ffb400]/50" />
        <span className="font-mono">
          {isStreaming ? "Thinking…" : "Thought process"}
        </span>
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {isStreaming && (
          <div className="flex gap-[2px] ml-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1 h-1 rounded-full bg-[#ffb400]"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  delay: i * 0.15,
                }}
              />
            ))}
          </div>
        )}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pl-3 ml-1 border-l-2 border-[#ffb400]/15 text-[12px] text-[#505050] leading-relaxed mt-1 max-h-[250px] overflow-y-auto font-mono whitespace-pre-wrap">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Execution Panel for code output ─── */

function ExecutionPanel({ result }: { result: ExecutionResult }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-2 rounded-lg border border-white/[0.06] bg-[#0a0a0a] overflow-hidden"
    >
      <div className="px-3 py-2 flex items-center gap-2">
        {result.status === "success" && (
          <>
            <Check className="h-3 w-3 text-green-400" />
            <span className="text-[11px] font-mono text-green-400">Success</span>
            <span className="text-[10px] font-mono text-[#505050]">
              {result.duration}ms
            </span>
          </>
        )}
        {result.status === "error" && (
          <span className="text-[11px] font-mono text-red-400">Error</span>
        )}
        {result.status === "timeout" && (
          <span className="text-[11px] font-mono text-yellow-400">Timeout</span>
        )}
      </div>
      {(result.output || result.error) && (
        <div className="px-3 py-2 border-t border-white/[0.04] bg-black/20">
          <pre className="text-[11px] font-mono text-[#737373] whitespace-pre-wrap overflow-x-auto">
            {result.output || result.error}
          </pre>
        </div>
      )}
    </motion.div>
  );
}

/* ─── Code Block with header, copy, preview ─── */

function CodeBlock({
  code,
  lang,
  onPreview,
  onQuickAction,
  isRunning,
}: {
  code: string;
  lang: string;
  onPreview?: (code: string, lang: string) => void;
  onQuickAction?: (
    action: "explain" | "tests" | "run",
    code: string,
    lang: string
  ) => void;
  isRunning?: boolean;
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
    <div className="relative my-4 rounded-xl overflow-hidden border border-white/[0.06] bg-[#0c0c0c] hover:border-white/[0.15] transition-colors duration-300">
      {/* Header bar — with quick actions */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.03] border-b border-white/[0.06] transition-colors duration-200 hover:bg-white/[0.05]">
        <div className="flex items-center gap-2">
          <CodeIcon className="h-3.5 w-3.5 text-[#505050]" />
          <span className="text-[12px] font-mono text-[#707070] capitalize px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.03]">
            {lang || "Code"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Run button - only for executable languages */}
          {isExecutable && (
            <button
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-[#22c55e] hover:bg-[#22c55e15] transition-colors disabled:opacity-50"
              onClick={() => onQuickAction?.("run", code, lang)}
              disabled={isRunning}
              title="Run code"
            >
              <Play className="h-3 w-3" />
              {isRunning ? "..." : "Run"}
            </button>
          )}
          {/* Explain button */}
          <button
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-[#606060] hover:text-[#ffb400] hover:bg-[#ffb40008] transition-colors"
            onClick={() => onQuickAction?.("explain", code, lang)}
            title="Explain this code"
          >
            <Brain className="h-3 w-3" />
          </button>
          {/* Tests button */}
          <button
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-[#606060] hover:text-[#ffb400] hover:bg-[#ffb40008] transition-colors"
            onClick={() => onQuickAction?.("tests", code, lang)}
            title="Generate tests"
          >
            <Sparkles className="h-3 w-3" />
          </button>
          {/* Preview button */}
          {isPreviewable && onPreview && (
            <button
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-[#ffb400] bg-[#ffb40008] hover:bg-[#ffb40015] transition-colors"
              onClick={() => onPreview(code, lang)}
            >
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
          {/* Copy button */}
          <button
            className="flex items-center justify-center h-6 w-6 rounded-md text-[#505050] hover:text-white hover:bg-white/[0.06] hover-lift transition-all duration-200 ease-in-out"
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
      {/* Code content */}
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
          <span className="text-[12px] font-mono text-[#505050]">
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
            <span className="text-[14px] text-[#505050]">Working on it…</span>
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
  const rawContent = isStreaming && streamedContent ? streamedContent : hydratedContent;
  const [msgCopied, setMsgCopied] = useState(false);

  // Code execution state
  const [executionResults, setExecutionResults] = useState<
    Record<string, ExecutionResult>
  >({});
  const [runningBlock, setRunningBlock] = useState<string | null>(null);

  useEffect(() => {
    if (isStreaming) {
      // Keep live stream content as-is while tokens are arriving.
      if (streamedContent !== undefined) {
        setHydratedContent(streamedContent);
      }
      return;
    }

    const messageId = message._id ? String(message._id) : null;
    if (!messageId) {
      setHydratedContent(message.content);
      return;
    }

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
  }, [isStreaming, streamedContent, message._id, message.content]);

  // Run code handler
  const handleRunCode = async (code: string, lang: string) => {
    const blockId = `${lang}-${code.slice(0, 20).replace(/\s/g, "_")}`;
    setRunningBlock(blockId);
    try {
      const result = await executeCode(code);
      setExecutionResults((prev) => ({ ...prev, [blockId]: result }));
    } finally {
      setRunningBlock(null);
    }
  };

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
        <div className="max-w-[80%] rounded-2xl px-5 py-3 bg-[#1a1a1a] border border-white/[0.08] text-[#e5e5e5] shadow-sm">
          {userImageUrls.length > 0 && (
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 mb-2">
              {userImageUrls.map((url, idx) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${url.slice(0, 32)}-${idx}`}
                  src={url}
                  alt={`Attached ${idx + 1}`}
                  className="max-h-[240px] w-full object-cover rounded-xl border border-white/[0.12]"
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
            <span className="text-[12px] font-mono text-[#505050]">
              leopard
            </span>
            {modelLabel && (
              <span className="text-[10px] font-mono text-[#7e7e7e] bg-white/[0.03] border border-white/[0.06] px-1.5 py-0.5 rounded-md">
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
                />
              ))}
            </div>
          )}

          {/* Main response */}
          {displayContent && (
            <div className="markdown-body text-[15px] leading-[1.75] text-[#d4d4d4] border border-white/[0.06] rounded-2xl px-4 py-3">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                urlTransform={(url) => url}
                components={{
                  /* Block code: extract raw text, render with CodeBlock */
                  pre({ children, ...props }) {
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
                      const blockId = `${lang}-${rawText.slice(0, 20).replace(/\s/g, "_")}`;
                      return (
                        <CodeBlock
                          code={rawText}
                          lang={lang}
                          onPreview={handlePreview}
                          onQuickAction={onQuickAction}
                          isRunning={runningBlock === blockId}
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
                  code({ className, children, ...props }) {
                    return (
                      <code
                        className={cn(
                          className,
                          "text-[12px] font-mono text-[#505050] px-1.5 py-0.5 rounded bg-white/[0.06] text-[#e8b940]"
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
                      <div className="overflow-x-auto my-4 rounded-lg border border-white/[0.06]">
                        <table className="w-full text-[12px] font-mono text-[#505050]">{children}</table>
                      </div>
                    );
                  },
                  th({ children }) {
                    return (
                      <th className="px-3 py-2 bg-white/[0.03] text-left text-[12px] font-mono text-[#808080] border-b border-white/[0.06]">
                        {children}
                      </th>
                    );
                  },
                  td({ children }) {
                    return (
                      <td className="px-3 py-2 border-b border-white/[0.03] text-[#b0b0b0]">
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
                        className="my-3 max-w-full rounded-xl border border-white/[0.08]"
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
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-[#353535] hover:text-[#e5e5e5] hover:bg-white/[0.04] hover-lift transition-colors"
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
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-[#353535] hover:text-[#e5e5e5] hover:bg-white/[0.04] hover-lift transition-colors"
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
