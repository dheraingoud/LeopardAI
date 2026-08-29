"use client";

import type { ComponentProps, ReactNode } from "react";
import { ArrowDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ghostButton } from "../surfaces";

// Presentational port of the upstream default thread layout: scrollable
// viewport, centered max-width column, welcome block when empty, sticky
// composer footer. All runtime state arrives as props; slots are ReactNodes.

export type ThreadLayoutProps = Omit<ComponentProps<"div">, "children"> & {
  empty?: boolean;
  welcome?: ReactNode;
  messages?: ReactNode;
  composer?: ReactNode;
  suggestions?: ReactNode;
  onScrollToBottom?: () => void;
};

export function ThreadLayout({
  empty = false,
  welcome,
  messages,
  composer,
  suggestions,
  onScrollToBottom,
  className,
  ...props
}: ThreadLayoutProps) {
  return (
    <div
      data-slot="thread-layout"
      className={cn("@container flex h-full flex-col bg-background", className)}
      style={{ ["--thread-max-width" as string]: "44rem" }}
      {...props}
    >
      <div
        data-slot="thread-viewport"
        className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth"
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-4 pt-4",
            empty && "justify-center",
          )}
        >
          {empty && welcome}

          <div
            data-slot="thread-messages"
            className="mb-14 flex flex-col gap-y-6 empty:hidden"
          >
            {messages}
          </div>

          <div
            data-slot="thread-footer"
            className={cn(
              "flex flex-col gap-4 bg-background pb-4 md:pb-6",
              !empty && "sticky bottom-0 mt-auto rounded-t-3xl",
            )}
          >
            {onScrollToBottom && (
              <button
                type="button"
                aria-label="Scroll to bottom"
                onClick={onScrollToBottom}
                className={cn(
                  ghostButton,
                  "absolute -top-12 z-10 size-8 self-center border dark:border-white/[0.08] light:border-black/[0.08] bg-background",
                )}
              >
                <ArrowDownIcon className="size-4" />
              </button>
            )}
            {composer}
            {empty && suggestions}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ThreadWelcome({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="thread-welcome"
      className={cn(
        "mb-6 flex flex-col items-center px-4 text-center",
        className,
      )}
      {...props}
    />
  );
}

export function ThreadSuggestions({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="thread-suggestions"
      className={cn(
        "flex w-full flex-wrap items-center justify-center gap-2 px-4",
        className,
      )}
      {...props}
    />
  );
}
