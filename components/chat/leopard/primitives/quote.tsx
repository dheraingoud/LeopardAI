"use client";

import { memo } from "react";
import { QuoteIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Quoted-text chip for user messages (the text a QuoteReply selection put in
// the composer). Live quote flow: quote-reply writes "> text" into the composer
// and streaming-text renders it as a blockquote — this block is for surfaces
// that carry the quote as structured data instead.
export const QuoteBlock = memo(function QuoteBlock({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div data-slot="quote-block" className={cn("mb-2 flex items-start gap-1.5", className)}>
      <QuoteIcon className="mt-0.5 size-3 shrink-0 dark:text-[#ffb400]/70 light:text-[#d49600]/70" />
      <p className="line-clamp-2 min-w-0 text-sm italic dark:text-[#a3a3a3] light:text-[#525252]">
        {text}
      </p>
    </div>
  );
});
