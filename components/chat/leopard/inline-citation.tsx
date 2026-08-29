"use client";

import { useState, type ComponentProps } from "react";
import { PreviewCard } from "@base-ui/react/preview-card";
import { cn } from "@/lib/utils";
import { floating, mono } from "./surfaces";

export interface CitationSource {
  domain: string;
  title: string;
  snippet: string;
}

// Leopard fork of the kit InlineCitation: numbered chip + hover preview card.
// The streaming renderer wraps every markdown link in a CitationLink so any
// cited URL gets the domain popover.
export function Citation({
  index,
  source,
  open,
  onOpenChange,
}: {
  index: number;
  source: CitationSource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <PreviewCard.Root open={open} onOpenChange={onOpenChange}>
      <PreviewCard.Trigger
        delay={0}
        render={<button type="button" />}
        className={cn(
          "mx-0.5 inline-flex h-4 min-w-4 translate-y-[-2px] cursor-default items-center justify-center rounded-[5px] px-1 align-middle font-mono text-[10px] font-medium tabular-nums transition-colors",
          open
            ? "bg-foreground text-background"
            : "bg-foreground/[0.06] text-foreground/45 hover:text-foreground/90",
        )}
      >
        {index + 1}
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner side="top" sideOffset={8}>
          <PreviewCard.Popup
            className={cn(
              floating,
              "z-50 w-64 origin-(--transform-origin) rounded-2xl p-3.5 outline-none",
              "transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
              "data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0",
              "data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0",
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="bg-foreground/[0.06] text-foreground/45 flex size-4 items-center justify-center rounded text-[9px] font-medium">
                {source.domain[0]?.toUpperCase()}
              </span>
              <span className={cn(mono, "text-foreground/40")}>
                {source.domain}
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-snug font-medium">
              {source.title}
            </p>
            <p className="text-foreground/50 mt-1 text-[13px] leading-relaxed">
              {source.snippet}
            </p>
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}

// Link + hover preview of its target. Used as the markdown `a` renderer.
export function CitationLink({
  href,
  children,
  ...props
}: ComponentProps<"a">) {
  const [open, setOpen] = useState(false);
  let domain = "";
  try {
    domain = href ? new URL(href).hostname.replace(/^www\./, "") : "";
  } catch {
    domain = "";
  }
  if (!domain) {
    return (
      <a href={href} target="_blank" rel="nofollow noopener noreferrer" {...props}>
        {children}
      </a>
    );
  }
  return (
    <PreviewCard.Root open={open} onOpenChange={setOpen}>
      <PreviewCard.Trigger
        delay={0}
        render={
          <a href={href} target="_blank" rel="nofollow noopener noreferrer" />
        }
        {...props}
      >
        {children}
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner side="top" sideOffset={6}>
          <PreviewCard.Popup
            className={cn(
              floating,
              "z-50 max-w-xs origin-(--transform-origin) rounded-xl px-3 py-2 outline-none",
              "transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none",
              "data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0",
              "data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0",
            )}
          >
            <span className={cn(mono, "text-foreground/50 break-all")}>
              {domain}
            </span>
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
