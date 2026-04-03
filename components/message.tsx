"use client";

import { memo, useState, useMemo, useRef, useEffect } from "react";
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
import type { Artifact } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

/* ─── Parse <think> tags from model output ─── */

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
  const [expanded, setExpanded] = useState(false);

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
        {!isStreaming &&
          (expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          ))}
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
        {(expanded || isStreaming) && (
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

/* ─── Code Block with header, copy, preview ─── */

function CodeBlock({
  code,
  lang,
  onPreview,
}: {
  code: string;
  lang: string;
  onPreview?: (code: string, lang: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const lines = code.split("\n");
  const lineCount = lines.length;
  const isPreviewable =
    ["html", "jsx", "tsx", "react", "svg", "markdown", "md", "mermaid", "csv"].includes(lang) &&
    lineCount > 3;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-4 rounded-xl overflow-hidden border border-white/[0.06] bg-[#0c0c0c]">
      {/* Header bar — like the reference image */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.03] border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <CodeIcon className="h-3.5 w-3.5 text-[#505050]" />
          <span className="text-[12px] font-mono text-[#707070] capitalize">
            {lang || "Code"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {isPreviewable && onPreview && (
            <button
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono text-[#ffb400] bg-[#ffb40008] hover:bg-[#ffb40018] border border-[#ffb40020] transition-colors"
              onClick={() => onPreview(code, lang)}
            >
              <Play className="h-3 w-3" />
              Preview
            </button>
          )}
          <button
            className="flex items-center justify-center h-7 w-7 rounded-md text-[#505050] hover:text-white hover:bg-white/[0.06] transition-colors"
            onClick={handleCopy}
            title="Copy code"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
      {/* Code content */}
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <pre
          style={{
            margin: 0,
            padding: "16px",
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
              fontSize: "13px",
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
      <div className="flex items-start gap-3 py-6">
        <div className="h-7 w-7 rounded-full flex items-center justify-center bg-gradient-to-br from-[#ffb400] to-[#e6920a] shrink-0">
          <Sparkles className="h-3.5 w-3.5 text-black" />
        </div>
        <div className="flex flex-col gap-2 pt-0.5">
          <span className="text-[13px] font-medium text-[#e5e5e5]">
            Leopard
          </span>
          <div className="flex items-center gap-2.5">
            <div className="flex gap-[3px]">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-[6px] h-[6px] rounded-full bg-[#ffb400]"
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
            <span className="text-[13px] text-[#505050]">Thinking…</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Main Message Component ─── */

function MessageComponent({
  message,
  index,
  isStreaming,
  streamedContent,
  onOpenArtifact,
  onRegenerate,
  isLast,
  userAvatar,
}: MessageProps) {
  const isUser = message.role === "user";
  const rawContent =
    isStreaming && streamedContent ? streamedContent : message.content;
  const [msgCopied, setMsgCopied] = useState(false);

  const { thinking, response: displayContent } = useMemo(
    () =>
      isUser
        ? { thinking: null, response: rawContent }
        : parseThinking(rawContent),
    [rawContent, isUser]
  );

  const artifacts = useMemo(
    () => (!isUser && displayContent ? detectArtifacts(displayContent) : []),
    [displayContent, isUser]
  );

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(displayContent);
    setMsgCopied(true);
    toast.success("Copied");
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
        className="flex justify-end py-2"
      >
        <div className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 bg-[#1a1a1a] border border-white/[0.06] text-[#e5e5e5]">
          <p className="text-[14px] leading-[1.6] whitespace-pre-wrap">
            {displayContent}
          </p>
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
      className="group py-4"
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="h-7 w-7 rounded-full flex items-center justify-center bg-gradient-to-br from-[#ffb400] to-[#e6920a] shrink-0 mt-0.5">
          <Sparkles className="h-3.5 w-3.5 text-black" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Name */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[13px] font-medium text-[#e5e5e5]">
              Leopard
            </span>
          </div>

          {/* Thinking block */}
          {thinking && (
            <ThinkingBlock
              content={thinking}
              isStreaming={isStreaming && !displayContent}
            />
          )}

          {/* Main response */}
          {displayContent && (
            <div className="markdown-body text-[14px] leading-[1.75] text-[#d4d4d4]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
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
                      codeObj && typeof codeObj.props === "object" && codeObj.props
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
                          padding: "16px",
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
                          "text-[13px] px-1.5 py-0.5 rounded bg-white/[0.06] text-[#e8b940]"
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
                        <table className="w-full text-[13px]">{children}</table>
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
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-[#353535] hover:text-[#e5e5e5] hover:bg-white/[0.04] transition-colors"
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
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-[#353535] hover:text-[#e5e5e5] hover:bg-white/[0.04] transition-colors"
                  onClick={onRegenerate}
                >
                  <RefreshCw className="h-3 w-3" /> Retry
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
