"use client";

import { memo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { SyntaxHighlighter } from "./syntax-highlighter";

// Static markdown renderer (props in, no runtime hooks): the upstream component map
// re-based on leopard tokens. Streaming stays with leopard/streaming-text.
export const MarkdownText = memo(function MarkdownText({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={cn("text-[15px] leading-[1.75] dark:text-[#dedede] light:text-[#262626]", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});

function extractText(node: ReactNode): string {
  if (node == null || node === false) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in (node as any))
    return extractText((node as any).props?.children);
  return "";
}

function CodeHeader({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex items-center justify-between rounded-t-xl border border-b-0 px-3.5 py-1.5 text-xs dark:border-white/[0.08] dark:bg-white/[0.03] light:border-black/[0.08] light:bg-black/[0.03]">
      <span className="font-medium lowercase dark:text-[#a3a3a3] light:text-[#525252]">
        {language}
      </span>
      <button
        type="button"
        aria-label="Copy code"
        onClick={() => {
          if (!code || copied) return;
          void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className="dark:text-[#a3a3a3] light:text-[#525252] hover:dark:text-white hover:light:text-black"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

function Pre({ children }: { children?: ReactNode }) {
  const child = Array.isArray(children) ? children[0] : children;
  const cls: string = (child as any)?.props?.className ?? "";
  const lang = /language-([\w-]+)/.exec(cls)?.[1] ?? "text";
  const code = extractText((child as any)?.props?.children);
  return (
    <div>
      <CodeHeader language={lang} code={code} />
      <SyntaxHighlighter
        code={code}
        language={lang}
        className="rounded-t-none rounded-b-xl"
      />
    </div>
  );
}

const components = {
  h1: (p: any) => <h1 className="mt-5 mb-2 text-xl font-semibold first:mt-0 last:mb-0" {...p} />,
  h2: (p: any) => <h2 className="mt-5 mb-2 text-lg font-semibold first:mt-0 last:mb-0" {...p} />,
  h3: (p: any) => <h3 className="mt-4 mb-1.5 text-base font-semibold first:mt-0 last:mb-0" {...p} />,
  h4: (p: any) => <h4 className="mt-3.5 mb-1 text-base font-medium first:mt-0 last:mb-0" {...p} />,
  h5: (p: any) => <h5 className="mt-3 mb-1 text-sm font-semibold first:mt-0 last:mb-0" {...p} />,
  h6: (p: any) => <h6 className="mt-3 mb-1 text-sm font-medium first:mt-0 last:mb-0" {...p} />,
  p: (p: any) => <p className="my-3 leading-relaxed first:mt-0 last:mb-0" {...p} />,
  a: (p: any) => (
    <a
      className="underline underline-offset-2 dark:text-[#ffb400] light:text-[#d49600] hover:opacity-80"
      {...p}
    />
  ),
  blockquote: (p: any) => (
    <blockquote
      className="my-3 border-s-2 ps-4 dark:border-[#ffb400]/40 dark:text-[#a3a3a3] light:border-[#d49600]/40 light:text-[#525252]"
      {...p}
    />
  ),
  ul: (p: any) => <ul className="my-3 ms-5 list-disc marker:dark:text-[#737373] marker:light:text-[#8a8a8a] [&>li]:mt-1" {...p} />,
  ol: (p: any) => <ol className="my-3 ms-5 list-decimal marker:dark:text-[#737373] marker:light:text-[#8a8a8a] [&>li]:mt-1" {...p} />,
  li: (p: any) => <li className="leading-relaxed" {...p} />,
  hr: (p: any) => <hr className="my-3 dark:border-white/[0.08] light:border-black/[0.08]" {...p} />,
  table: (p: any) => <table className="my-3 w-full border-separate border-spacing-0 overflow-y-auto" {...p} />,
  th: (p: any) => (
    <th className="px-3 py-1.5 text-start font-medium first:rounded-ss-lg last:rounded-se-lg dark:bg-white/[0.04] light:bg-black/[0.035] [[align=center]]:text-center [[align=right]]:text-right" {...p} />
  ),
  td: (p: any) => (
    <td className="border-s border-b px-3 py-1.5 text-start last:border-e dark:border-white/[0.08] light:border-black/[0.08] [[align=center]]:text-center [[align=right]]:text-right" {...p} />
  ),
  strong: (p: any) => <strong className="font-semibold" {...p} />,
  sup: (p: any) => <sup className="[&>a]:text-xs [&>a]:no-underline" {...p} />,
  pre: Pre,
  code: ({ className, ...p }: any) => (
    <code
      className={cn(
        "rounded-md px-1.5 py-0.5 font-mono text-[0.85em] dark:bg-white/[0.06] light:bg-black/[0.05]",
        className,
      )}
      {...p}
    />
  ),
};
