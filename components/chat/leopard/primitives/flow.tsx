"use client";

import type { ComponentProps, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { FlowCanvas } from "./flow-canvas";
import { FlowExpand } from "./flow-expand";

// Composable flow-diagram primitives: Root wraps content in FlowExpand,
// Row/Column/Group lay out nodes, Arrow draws connectors, Node renders boxes
// and decision diamonds. Tones remapped to the leopard palette.

export type FlowRootProps = ComponentProps<"div">;

function FlowRoot({ className, children, ...props }: FlowRootProps) {
  return (
    <div
      data-slot="flow-root"
      className={cn("not-prose my-6 overflow-x-auto overflow-y-hidden", className)}
      {...props}
    >
      <FlowExpand>
        <div data-slot="flow-content" className="mx-auto w-fit py-3">
          {children}
        </div>
      </FlowExpand>
    </div>
  );
}

function FlowRow({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="flow-row"
      className={cn("flex items-center justify-center gap-3", className)}
      {...props}
    />
  );
}

function FlowColumn({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="flow-column"
      className={cn("flex flex-col items-center gap-3", className)}
      {...props}
    />
  );
}

export type FlowGroupProps = ComponentProps<"div"> & { flowId?: string };

function FlowGroup({ className, flowId, ...props }: FlowGroupProps) {
  return (
    <div
      data-slot="flow-group"
      data-flow-id={flowId}
      className={cn(
        "relative rounded-xl border border-dashed dark:border-white/[0.12] light:border-black/[0.12] p-4",
        className,
      )}
      {...props}
    />
  );
}

function FlowGroupLabel({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="flow-group-label"
      className={cn(
        "absolute -top-2 left-3 bg-background px-1.5 text-[10px] font-medium uppercase tracking-widest text-foreground/40",
        className,
      )}
      {...props}
    />
  );
}

const flowNodeVariants = cva(
  "relative inline-flex items-center justify-center text-sm whitespace-nowrap",
  {
    variants: {
      variant: {
        box: "rounded-md border px-3.5 py-1.5 dark:border-white/[0.1] light:border-black/[0.1] dark:bg-white/[0.03] light:bg-black/[0.02]",
        decision: "px-8 py-4",
      },
      tone: {
        default: "",
        amber: "border-[#ffb400]/40 bg-[#ffb400]/[0.08] dark:border-[#ffb400]/40 light:border-[#d49600]/50 light:bg-[#d49600]/[0.08]",
        red: "border-red-500/50 bg-red-500/10",
        green: "border-green-500/50 bg-green-500/10",
      },
    },
    defaultVariants: { variant: "box", tone: "default" },
  },
);

export type FlowNodeProps = ComponentProps<"span"> &
  VariantProps<typeof flowNodeVariants> & { flowId?: string };

function FlowNode({
  className,
  flowId,
  variant = "box",
  tone,
  children,
  ...props
}: FlowNodeProps) {
  return (
    <span
      data-slot="flow-node"
      data-variant={variant}
      data-tone={tone ?? "default"}
      data-flow-id={flowId}
      className={cn(flowNodeVariants({ variant, tone }), className)}
      {...props}
    >
      {variant === "decision" && (
        <svg
          aria-hidden
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polygon
            points="50,1 99,50 50,99 1,50"
            vectorEffect="non-scaling-stroke"
            strokeWidth={1}
            className="fill-background stroke-foreground/20"
          />
        </svg>
      )}
      <span data-slot="flow-node-content" className="relative">
        {children}
      </span>
    </span>
  );
}

export type FlowArrowProps = ComponentProps<"div"> & {
  label?: ReactNode;
  reverseLabel?: ReactNode;
  direction?: "right" | "down";
  length?: number;
};

function FlowArrow({
  className,
  label,
  reverseLabel,
  direction = "right",
  length = 88,
  ...props
}: FlowArrowProps) {
  if (direction === "down") {
    return (
      <div
        data-slot="flow-arrow"
        data-direction={direction}
        className={cn("relative flex justify-center text-foreground/30", className)}
        {...props}
      >
        <svg aria-hidden width={10} height={length}>
          <line x1={5} y1={0} x2={5} y2={length - 6} stroke="currentColor" strokeWidth={1.5} />
          <path d={`M 1.5 ${length - 7} L 5 ${length} L 8.5 ${length - 7} Z`} fill="currentColor" />
        </svg>
        {label && (
          <span className="absolute top-1/2 left-1/2 ml-2.5 -translate-y-1/2 text-xs whitespace-nowrap">
            {label}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      data-slot="flow-arrow"
      data-direction={direction}
      className={cn("flex flex-col items-center gap-1 text-foreground/30", className)}
      {...props}
    >
      {label && <span className="text-xs whitespace-nowrap">{label}</span>}
      <svg aria-hidden width={length} height={10}>
        <line x1={0} y1={5} x2={length - 6} y2={5} stroke="currentColor" strokeWidth={1.5} />
        <path d={`M ${length - 7} 1.5 L ${length} 5 L ${length - 7} 8.5 Z`} fill="currentColor" />
      </svg>
      {reverseLabel && (
        <>
          <svg aria-hidden width={length} height={10}>
            <line x1={6} y1={5} x2={length} y2={5} stroke="currentColor" strokeWidth={1.5} />
            <path d="M 7 1.5 L 0 5 L 7 8.5 Z" fill="currentColor" />
          </svg>
          <span className="text-xs whitespace-nowrap">{reverseLabel}</span>
        </>
      )}
    </div>
  );
}

export const Flow = Object.assign(FlowRoot, {
  Arrow: FlowArrow,
  Canvas: FlowCanvas,
  Column: FlowColumn,
  Group: FlowGroup,
  GroupLabel: FlowGroupLabel,
  Node: FlowNode,
  Root: FlowRoot,
  Row: FlowRow,
});

export { FlowArrow, FlowColumn, FlowGroup, FlowGroupLabel, FlowNode, FlowRoot, FlowRow };
export type { FlowCanvasEdge } from "./flow-canvas";
