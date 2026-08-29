"use client";

import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { mono, paper } from "../surfaces";

// Presentational generative-UI node renderer: the model (or a tool) describes
// a tree of typed nodes, this renders it with leopard surfaces. Replaces the
// upstream react-generative-ui registry, which is runtime-bound.

export type GenerativeNode =
  | { type: "markdown"; text: string }
  | { type: "stack"; children: GenerativeNode[] }
  | { type: "row"; children: GenerativeNode[] }
  | { type: "card"; title?: string; children: GenerativeNode[] }
  | { type: "metric"; label: string; value: string; hint?: string };

export function GenerativeUI({
  node,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & { node: GenerativeNode }) {
  return (
    <div data-slot="generative-ui" className={className} {...props}>
      <GenerativeNodeView node={node} />
    </div>
  );
}

function GenerativeNodeView({ node }: { node: GenerativeNode }) {
  switch (node.type) {
    case "markdown":
      return (
        <div data-slot="generative-markdown" className="text-sm leading-relaxed">
          <ReactMarkdown>{node.text}</ReactMarkdown>
        </div>
      );
    case "stack":
      return (
        <div data-slot="generative-stack" className="flex flex-col gap-3">
          {node.children.map((child, i) => (
            <GenerativeNodeView key={i} node={child} />
          ))}
        </div>
      );
    case "row":
      return (
        <div data-slot="generative-row" className="flex flex-wrap items-start gap-3">
          {node.children.map((child, i) => (
            <GenerativeNodeView key={i} node={child} />
          ))}
        </div>
      );
    case "card":
      return (
        <div data-slot="generative-card" className={cn(paper, "flex flex-col gap-2 rounded-2xl p-4")}>
          {node.title && (
            <span className={cn(mono, "text-foreground/40")}>{node.title}</span>
          )}
          {node.children.map((child, i) => (
            <GenerativeNodeView key={i} node={child} />
          ))}
        </div>
      );
    case "metric":
      return (
        <div data-slot="generative-metric" className={cn(paper, "flex min-w-28 flex-col gap-0.5 rounded-xl px-3.5 py-2.5")}>
          <span className={cn(mono, "text-foreground/40")}>{node.label}</span>
          <span className="text-lg font-medium tabular-nums dark:text-[#ffb400] light:text-[#d49600]">
            {node.value}
          </span>
          {node.hint && (
            <span className="text-xs text-foreground/40">{node.hint}</span>
          )}
        </div>
      );
  }
}
