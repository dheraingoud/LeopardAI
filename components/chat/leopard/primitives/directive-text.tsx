"use client";

import type { FC, ReactNode } from "react";
import { SparklesIcon } from "lucide-react";
import { Badge } from "./badge";

// Self-contained directive renderer (no upstream runtime formatter). Parses inline
// `{type:id|label}` directives into chips; everything else passes through as text.

type IconComponent = FC<{ className?: string }>;

export type DirectiveSegment =
  | { kind: "text"; text: string }
  | { kind: "directive"; type: string; id: string; label: string };

const DIRECTIVE_RE = /\{([a-z0-9_-]+):([^|{}]+)\|([^{}]+)\}/gi;

export function parseDirectives(text: string): DirectiveSegment[] {
  const out: DirectiveSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(DIRECTIVE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ kind: "text", text: text.slice(last, idx) });
    out.push({ kind: "directive", type: m[1]!.toLowerCase(), id: m[2]!.trim(), label: m[3]!.trim() });
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out.length ? out : [{ kind: "text", text }];
}

export type DirectiveTextProps = {
  text: string;
  iconMap?: Record<string, IconComponent>;
  fallbackIcon?: IconComponent;
  className?: string;
};

export function DirectiveText({ text, iconMap, fallbackIcon, className }: DirectiveTextProps) {
  const segments = parseDirectives(text);
  if (segments.length === 1 && segments[0]!.kind === "text") return <>{text}</>;

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          return (
            <span key={i} className="whitespace-pre-wrap">
              {seg.text}
            </span>
          );
        }
        const Icon: IconComponent = iconMap?.[seg.type] ?? fallbackIcon ?? SparklesIcon;
        return (
          <Badge
            key={i}
            variant="warning"
            size="sm"
            data-slot="directive-chip"
            data-directive-type={seg.type}
            data-directive-id={seg.id}
            aria-label={`${seg.type}: ${seg.label}`}
            className="mx-0.5 items-baseline align-baseline leading-none [&_svg]:self-center"
          >
            <Icon />
            {seg.label as ReactNode}
          </Badge>
        );
      })}
    </span>
  );
}
