"use client";

import { Component, type ReactNode } from "react";
import { Chart } from "@/aui/diagrammatic/spec";
import { cn } from "@/lib/utils";
import { mono, paper } from "../surfaces";
import { type ChartSpec } from "./registry";
import { toUpstreamSpec } from "./upstream-spec";

// Leopard chart surface — every forked diagrammatic form, themed with the
// --dg-* palette globals.css already maps onto --chart-*.

type BoundaryProps = { children: ReactNode };
type BoundaryState = { failed: boolean };

class ChartBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error("[leopard-chart]", error?.message);
  }

  render() {
    if (this.state.failed) {
      return (
        <p className={cn(mono, "text-foreground/40 text-[11px]")}>
          Chart unavailable
        </p>
      );
    }
    return this.props.children;
  }
}

function ChartFigure({ spec }: { spec: ChartSpec }) {
  let upstream;
  try {
    upstream = toUpstreamSpec(spec);
  } catch {
    return (
      <p className={cn(mono, "text-foreground/40 text-[11px]")}>
        Chart unavailable
      </p>
    );
  }
  return (
    <ChartBoundary>
      <Chart spec={upstream} />
    </ChartBoundary>
  );
}

export function LeopardChart({ spec }: { spec: ChartSpec }) {
  return (
    <div data-dg-motion="" className={cn(paper, "rounded-xl p-4 my-2")}>
      {spec.title ? (
        <p
          className={cn(
            mono,
            "text-foreground/50 mb-3 text-[11px] uppercase tracking-wider",
          )}
        >
          {spec.title}
        </p>
      ) : null}
      <div className="text-foreground overflow-x-auto">
        <ChartFigure spec={spec} />
      </div>
    </div>
  );
}
