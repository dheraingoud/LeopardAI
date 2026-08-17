"use client";

/**
 * Shared-Thread — read-only parts renderer for /share/[shareId].
 *
 * Replaces the legacy MessageList shim (which flattened parts to a content
 * string, so svg/mermaid/katex twins dropped). Renders persisted parts
 * through the SAME engine as the live chat (StreamItDown) so shared chats
 * keep inline SVG, mermaid, math and interleaved reasoning. No action rows,
 * no edit/regenerate, no suggestions — read-only surface.
 */
import { memo, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { StreamItDown } from "@/components/chat/streamitdown";

type Part = { type: string; text?: string };
type SharedMessage = {
  _id: string;
  role: "user" | "assistant" | "system";
  parts?: Part[];
  content?: string | null;
};

function messageSegments(m: SharedMessage) {
  const parts = m.parts ?? [];
  const out: Array<
    { kind: "text"; content: string } | { kind: "reasoning"; content: string }
  > = [];
  let cur: (typeof out)[number] | null = null;
  for (const p of parts) {
    if (!p.text) continue;
    if (p.type === "reasoning") {
      const c = p.text.trim();
      if (!c) continue;
      if (!cur || cur.kind !== "reasoning") {
        cur = { kind: "reasoning", content: c };
        out.push(cur);
      } else cur.content += "\n" + c;
    } else if (p.type === "text") {
      if (!cur || cur.kind !== "text") {
        cur = { kind: "text", content: p.text };
        out.push(cur);
      } else cur.content += p.text;
    }
  }
  return out;
}

/** Collapsed reasoning pill, expandable on tap. */
function ThoughtPill({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3 my-3 overflow-hidden rounded-2xl border dark:border-white/[0.06] light:border-black/[0.08] dark:bg-[linear-gradient(160deg,rgba(255,180,0,0.05)_0%,rgba(255,255,255,0.02)_50%,rgba(255,255,255,0.015)_100%)] light:bg-[linear-gradient(160deg,rgba(255,180,0,0.06)_0%,rgba(255,255,255,0.65)_60%)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:dark:bg-white/[0.02] light:hover:bg-black/[0.02]"
      >
        <Brain className="h-3.5 w-3.5 shrink-0 text-[#606060]" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#909090]">
          Thought
        </span>
        <span className="ml-1 text-[10px] font-mono text-[#606060] tabular-nums">
          {content.length.toLocaleString()} chars
        </span>
        <span className="flex-1" />
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-[#606060] transition-transform duration-300 ease-out",
            !open && "-rotate-90",
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t px-4 pb-3.5 pt-1 pl-5 dark:border-white/[0.05] light:border-black/[0.06] max-h-[420px] overflow-y-auto text-[13.5px] leading-[1.7] tracking-[-0.005em] dark:text-[#9a9a9a] light:text-[#404040] whitespace-pre-wrap break-words">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const SharedThread = memo(function SharedThread({
  messages,
}: {
  messages?: SharedMessage[] | null;
}) {
  if (!messages || messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <p className="text-sm font-mono dark:text-[#606060] light:text-[#8a8a8a]">
          No messages in this conversation.
        </p>
      </div>
    );
  }
  return (
    <div className="px-4 sm:px-8 py-6 space-y-6 overflow-y-auto">
      {messages.map((m) => {
        const isUser = m.role === "user";
        const segs = messageSegments(m);
        if (isUser) {
          const text = segs
            .filter((s) => s.kind === "text")
            .map((s) => s.content)
            .join("");
          return (
            <div key={m._id} className="flex justify-end">
              <p className="max-w-[68ch] text-right text-[15px] leading-[1.65] whitespace-pre-wrap text-foreground/85">
                {text}
              </p>
            </div>
          );
        }
        return (
          <div key={m._id} className="space-y-3">
            {segs.map((seg, i) =>
              seg.kind === "reasoning" ? (
                <ThoughtPill key={`r-${i}`} content={seg.content} />
              ) : (
                <StreamItDown key={`t-${i}`} content={seg.content} />
              ),
            )}
          </div>
        );
      })}
    </div>
  );
});