"use client";

import { cn } from "@/lib/utils";
import { useShikiHtml } from "./shiki-highlighter";

// Presentational code block: shiki-highlighted when settled, plain <pre> with
// identical chrome while streaming. (Upstream's prism variant needs
// react-syntax-highlighter, which leopard doesn't ship — shiki backs both.)
export function SyntaxHighlighter({
  code,
  language,
  streaming,
  className,
}: {
  code: string;
  language: string;
  streaming?: boolean;
  className?: string;
}) {
  const trimmed = code.trim();
  const html = useShikiHtml(language, trimmed, !!streaming);
  return (
    <div
      data-slot="syntax-highlighter"
      className={cn(
        "overflow-x-auto border dark:border-white/[0.08] light:border-black/[0.08] dark:bg-white/[0.02] light:bg-black/[0.02] [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:p-3.5 [&_pre]:text-[13px] [&_pre]:leading-relaxed",
        className,
      )}
    >
      {html ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="p-3.5 font-mono text-[13px] leading-relaxed dark:text-[#dedede] light:text-[#262626]">
          <code>{trimmed}</code>
        </pre>
      )}
    </div>
  );
}
