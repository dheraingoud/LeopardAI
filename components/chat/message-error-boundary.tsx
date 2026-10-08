"use client";

import { Component, type ReactNode } from "react";

/**
 * MessageRenderBoundary — isolates a throwing message renderer from the rest
 * of the transcript (audit 2026-10-09: zero error boundaries meant one bad
 * mermaid/KaTeX/chart render unmounted the whole chat). A caught message
 * renders a quiet "couldn't render" note; the rest of the list survives.
 */
type Props = { children: ReactNode; fallbackLabel?: string };
type State = { error: Error | null };

export class MessageRenderBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Log for diagnosis — the UI must never show raw error text.
    console.error("[message-render]", error?.message, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="my-2 inline-flex items-center gap-2 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-1.5 text-[12px] text-foreground/50">
          <span className="font-mono text-[10px] uppercase tracking-wide">
            render error
          </span>
          {this.props.fallbackLabel ?? "This part of the reply couldn't be displayed."}
        </div>
      );
    }
    return this.props.children;
  }
}
