"use client";

// Shared-Thread — read-only parts renderer for /share/[shareId]. Same engine
// as the live chat (StreamingText) + the leopard ReasoningPanel for thinking
// segments. No actions — read-only surface.

import { memo, useState } from "react";
import { compactWhitespace } from "@/lib/utils";
import { StreamingText } from "./leopard/streaming-text";
import { ReasoningPanel } from "./leopard/reasoning-panel";

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

function ReasoningSeg({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <ReasoningPanel
      content={compactWhitespace(content)}
      streaming={false}
      open={open}
      onOpenChange={setOpen}
      className="max-w-none"
    />
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
    <div className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-6 min-w-0">
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
                <p className="max-w-[68ch] text-right text-[15px] leading-[1.65] whitespace-pre-wrap break-words text-foreground/85">
                  {text}
                </p>
              </div>
            );
          }
          return (
            <div key={m._id} className="space-y-3 min-w-0">
              {segs.map((seg, i) =>
                seg.kind === "reasoning" ? (
                  <ReasoningSeg key={`r-${i}`} content={seg.content} />
                ) : (
                  <div key={`t-${i}`} className="min-w-0">
                    <StreamingText content={seg.content} />
                  </div>
                ),
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
